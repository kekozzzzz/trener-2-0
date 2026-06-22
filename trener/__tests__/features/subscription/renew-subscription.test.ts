/**
 * Автопродление подписки: шаг очереди RENEW_SUBSCRIPTION (списание с сохранённой карты
 * + продление) и биллинг-свип runSubscriptionRenewals (постановка задач + EXPIRED).
 * Реальная тестовая база; платёжный адаптер — фейк (succeeded, без сети).
 *
 * Главное, что проверяем:
 *  1. Просроченная активная подписка с картой → продлена: новый период с дня списания,
 *     метр обнулён (currentPeriodStart ≈ сейчас, nextPaymentAt ≈ +30д), статус ACTIVE.
 *  2. Запланированный даунгрейд применяется при продлении: planCode → дешёвый,
 *     scheduledPlanCode очищен.
 *  3. Нет сохранённой карты → EXPIRED (без грейса).
 *  4. Свип ставит задачу продления для оплачиваемой просроченной и гасит отменённую.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import { renewSubscriptionStep } from "@/infrastructure/queue/steps/renew-subscription";
import { runSubscriptionRenewals } from "@/infrastructure/jobs/renew-subscriptions";
import type { RawTask } from "@/infrastructure/queue/types";

const P1 = "33333333-0000-0000-0000-000000000001";
const P2 = "33333333-0000-0000-0000-000000000002";
const DAY_MS = 24 * 60 * 60 * 1000;

function renewTask(subscriptionId: string): RawTask {
  return {
    id: "00000000-0000-0000-0000-0000000000aa",
    type: "RENEW_SUBSCRIPTION",
    payload: { subscriptionId },
    status: "PENDING",
    attempt: 0,
    run_after: new Date(),
    done_at: null,
    error: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

async function createSub(
  playerId: string,
  opts: {
    status: "ACTIVE" | "CANCELED" | "EXPIRED";
    planCode: string;
    nextPaymentAt: Date;
    currentPeriodStart?: Date;
    paymentMethodId?: string | null;
    scheduledPlanCode?: string | null;
  },
): Promise<string> {
  const sub = await prisma.subscription.create({
    data: {
      playerId,
      status: opts.status,
      planCode: opts.planCode,
      currentPeriodStart: opts.currentPeriodStart ?? new Date(Date.now() - 35 * DAY_MS),
      nextPaymentAt: opts.nextPaymentAt,
      paymentMethodId: opts.paymentMethodId ?? null,
      scheduledPlanCode: opts.scheduledPlanCode ?? null,
      externalSubscriptionId: `ext_${playerId}_${Math.random().toString(36).slice(2)}`,
      paymentProvider: "yookassa",
    },
  });
  return sub.id;
}

async function cleanup(): Promise<void> {
  // RENEW_SUBSCRIPTION — новый тип задач, заводится только этим тестом; чистим все.
  await prisma.task.deleteMany({ where: { type: "RENEW_SUBSCRIPTION" } });
  for (const pid of [P1, P2]) {
    const subs = await prisma.subscription.findMany({ where: { playerId: pid }, select: { id: true } });
    await prisma.payment.deleteMany({ where: { subscriptionId: { in: subs.map((s) => s.id) } } });
    await prisma.subscription.deleteMany({ where: { playerId: pid } });
  }
}

beforeAll(async () => {
  for (const [pid, email] of [
    [P1, "renew-p1@trener.local"],
    [P2, "renew-p2@trener.local"],
  ] as const) {
    await prisma.player.upsert({ where: { id: pid }, update: {}, create: { id: pid, email } });
  }
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await prisma.player.deleteMany({ where: { id: { in: [P1, P2] } } });
  await prisma.$disconnect();
});

describe("renewSubscriptionStep", () => {
  it("просроченная активная с картой → продлена, метр обнулён (период с дня списания)", async () => {
    const id = await createSub(P1, {
      status: "ACTIVE",
      planCode: "standard",
      nextPaymentAt: new Date(Date.now() - 2 * DAY_MS), // период истёк 2 дня назад
      paymentMethodId: "pm_renew_1",
    });

    await renewSubscriptionStep(renewTask(id), prisma);

    const sub = await prisma.subscription.findUnique({ where: { id } });
    expect(sub?.status).toBe("ACTIVE");
    expect(sub?.planCode).toBe("standard");
    // Новый период стартует с момента списания (≈ сейчас), не продлевает старый.
    const now = Date.now();
    expect(sub!.currentPeriodStart.getTime()).toBeGreaterThan(now - 60 * 1000);
    expect(sub!.nextPaymentAt!.getTime()).toBeGreaterThan(now + 29 * DAY_MS);
    expect(sub!.nextPaymentAt!.getTime()).toBeLessThan(now + 31 * DAY_MS);

    const payments = await prisma.payment.findMany({ where: { subscriptionId: id } });
    expect(payments).toHaveLength(1);
  });

  it("запланированный даунгрейд применяется при продлении", async () => {
    const id = await createSub(P1, {
      status: "ACTIVE",
      planCode: "standard",
      nextPaymentAt: new Date(Date.now() - 1 * DAY_MS),
      paymentMethodId: "pm_renew_2",
      scheduledPlanCode: "basic", // запланирован переход на дешёвый
    });

    await renewSubscriptionStep(renewTask(id), prisma);

    const sub = await prisma.subscription.findUnique({ where: { id } });
    expect(sub?.planCode).toBe("basic"); // даунгрейд вступил в силу
    expect(sub?.scheduledPlanCode).toBeNull(); // пометка снята
    expect(sub?.status).toBe("ACTIVE");
  });

  it("нет сохранённой карты → EXPIRED (без грейса)", async () => {
    const id = await createSub(P1, {
      status: "ACTIVE",
      planCode: "basic",
      nextPaymentAt: new Date(Date.now() - 1 * DAY_MS),
      paymentMethodId: null,
    });

    await renewSubscriptionStep(renewTask(id), prisma);

    const sub = await prisma.subscription.findUnique({ where: { id } });
    expect(sub?.status).toBe("EXPIRED");
  });

  it("период ещё не истёк → ничего не списываем", async () => {
    const id = await createSub(P1, {
      status: "ACTIVE",
      planCode: "basic",
      nextPaymentAt: new Date(Date.now() + 10 * DAY_MS), // ещё активна
      paymentMethodId: "pm_renew_3",
    });

    await renewSubscriptionStep(renewTask(id), prisma);

    const payments = await prisma.payment.findMany({ where: { subscriptionId: id } });
    expect(payments).toHaveLength(0); // списания не было
  });
});

describe("runSubscriptionRenewals (биллинг-свип)", () => {
  it("ставит задачу продления для оплачиваемой просроченной и гасит отменённую", async () => {
    const dueId = await createSub(P1, {
      status: "ACTIVE",
      planCode: "standard",
      nextPaymentAt: new Date(Date.now() - 1 * DAY_MS),
      paymentMethodId: "pm_sweep_1",
    });
    await createSub(P2, {
      status: "CANCELED", // автопродление отключено, период истёк
      planCode: "basic",
      nextPaymentAt: new Date(Date.now() - 1 * DAY_MS),
      paymentMethodId: "pm_sweep_2",
    });

    const res = await runSubscriptionRenewals(prisma);
    expect(res.enqueued).toBe(1);
    expect(res.expired).toBe(1);

    const tasks = await prisma.task.findMany({
      where: { type: "RENEW_SUBSCRIPTION", payload: { path: ["subscriptionId"], equals: dueId } },
    });
    expect(tasks).toHaveLength(1);

    const canceled = await prisma.subscription.findUnique({ where: { playerId: P2 } });
    expect(canceled?.status).toBe("EXPIRED");
  });

  it("повторный свип не плодит вторую задачу по той же подписке (дедуп)", async () => {
    await createSub(P1, {
      status: "ACTIVE",
      planCode: "standard",
      nextPaymentAt: new Date(Date.now() - 1 * DAY_MS),
      paymentMethodId: "pm_sweep_3",
    });

    const first = await runSubscriptionRenewals(prisma);
    const second = await runSubscriptionRenewals(prisma);
    expect(first.enqueued).toBe(1);
    expect(second.enqueued).toBe(0); // задача уже стоит
  });
});

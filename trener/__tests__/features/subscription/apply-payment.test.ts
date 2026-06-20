/**
 * Тесты applySucceededPayment (features/subscription/apply-payment) — активация и
 * продление подписки + идемпотентность проводки. Реальная тестовая база
 * (trener_test), как в остальных feature-тестах.
 *
 * Покрывают:
 *  1. Первая оплата → подписка ACTIVE, проводка, сохранён paymentMethodId, период +30д.
 *  2. Повтор того же external_payment_id → "duplicate": одна проводка, период НЕ
 *     продлён второй раз (главная гарантия — «один платёж = одна проводка»).
 *  3. Второй платёж (другой id) → продление: одна подписка, две проводки, период сдвинут.
 *  4. Неоплаченный платёж → "ignored", ничего не создано.
 *  5. metadata без planCode → бросает (это наш баг, не валидный платёж).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import { applySucceededPayment } from "@/features/subscription/apply-payment";
import type { ProviderPayment } from "@/infrastructure/adapters/payments";

const PLAYER_ID = "22222222-0000-0000-0000-000000000001";
const DAY_MS = 24 * 60 * 60 * 1000;

function payment(overrides: Partial<ProviderPayment> = {}): ProviderPayment {
  return {
    externalPaymentId: "pay_test_1",
    status: "succeeded",
    paid: true,
    money: { amountKopecks: 90_000, currency: "RUB" },
    paymentMethodId: "pm_test_1",
    metadata: { playerId: PLAYER_ID, planCode: "basic" },
    capturedAt: new Date("2026-06-19T10:00:00.000Z"),
    ...overrides,
  };
}

async function cleanup(): Promise<void> {
  // FK Restrict: сначала платежи, потом подписки.
  const subs = await prisma.subscription.findMany({ where: { playerId: PLAYER_ID }, select: { id: true } });
  await prisma.payment.deleteMany({ where: { subscriptionId: { in: subs.map((s) => s.id) } } });
  await prisma.subscription.deleteMany({ where: { playerId: PLAYER_ID } });
}

beforeAll(async () => {
  await prisma.player.upsert({
    where: { id: PLAYER_ID },
    update: {},
    create: { id: PLAYER_ID, email: "test-apply-payment@trener.local" },
  });
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await prisma.player.delete({ where: { id: PLAYER_ID } }).catch(() => {});
  await prisma.$disconnect();
});

describe("applySucceededPayment", () => {
  it("первая оплата активирует подписку и пишет проводку", async () => {
    const result = await applySucceededPayment(payment());
    expect(result).toBe("applied");

    const sub = await prisma.subscription.findUnique({ where: { playerId: PLAYER_ID } });
    expect(sub?.status).toBe("ACTIVE");
    expect(sub?.planCode).toBe("basic");
    expect(sub?.paymentMethodId).toBe("pm_test_1");
    expect(sub?.nextPaymentAt?.getTime()).toBe(new Date("2026-06-19T10:00:00.000Z").getTime() + 30 * DAY_MS);

    const payments = await prisma.payment.findMany({ where: { subscriptionId: sub!.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].amountCents).toBe(90_000);
    expect(payments[0].status).toBe("SUCCEEDED");
  });

  it("повтор того же платежа идемпотентен: одна проводка, период не продлён дважды", async () => {
    await applySucceededPayment(payment());
    const after1 = await prisma.subscription.findUnique({ where: { playerId: PLAYER_ID } });

    const second = await applySucceededPayment(payment()); // тот же external_payment_id
    expect(second).toBe("duplicate");

    const after2 = await prisma.subscription.findUnique({ where: { playerId: PLAYER_ID } });
    expect(after2?.nextPaymentAt?.getTime()).toBe(after1?.nextPaymentAt?.getTime());

    const payments = await prisma.payment.findMany({ where: { subscriptionId: after2!.id } });
    expect(payments).toHaveLength(1);
  });

  it("второй платёж продлевает период и добавляет вторую проводку", async () => {
    await applySucceededPayment(payment());
    const after1 = await prisma.subscription.findUnique({ where: { playerId: PLAYER_ID } });

    // Продление: другой id платежа, списано позже. Новый период стартует с конца
    // оплаченного, поэтому сдвиг ровно на +30д от прежнего nextPaymentAt.
    const renewal = payment({
      externalPaymentId: "pay_test_2",
      capturedAt: new Date("2026-07-15T10:00:00.000Z"),
    });
    const result = await applySucceededPayment(renewal);
    expect(result).toBe("applied");

    const after2 = await prisma.subscription.findUnique({ where: { playerId: PLAYER_ID } });
    expect(after2?.nextPaymentAt?.getTime()).toBe(after1!.nextPaymentAt!.getTime() + 30 * DAY_MS);

    const subs = await prisma.subscription.findMany({ where: { playerId: PLAYER_ID } });
    expect(subs).toHaveLength(1); // одна подписка, не вторая

    const payments = await prisma.payment.findMany({ where: { subscriptionId: after2!.id } });
    expect(payments).toHaveLength(2);
  });

  it("неоплаченный платёж игнорируется", async () => {
    const result = await applySucceededPayment(payment({ paid: false, status: "pending" }));
    expect(result).toBe("ignored");
    const sub = await prisma.subscription.findUnique({ where: { playerId: PLAYER_ID } });
    expect(sub).toBeNull();
  });

  it("платёж без корректных metadata бросает", async () => {
    await expect(applySucceededPayment(payment({ metadata: { playerId: PLAYER_ID } }))).rejects.toThrow();
  });
});

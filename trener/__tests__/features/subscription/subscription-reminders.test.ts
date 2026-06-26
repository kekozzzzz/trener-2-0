/**
 * Тесты runSubscriptionReminders (infrastructure/jobs/subscription-reminders).
 * Реальная тестовая база (trener_test). Email замокан — перехватываем письма.
 *
 * Покрывают:
 *  1. Период кончается в окне, есть карта → письмо «скоро спишем», отметка проставлена.
 *  2. Период кончается в окне, без карты → письмо «истекает».
 *  3. Период вне окна (далеко) → не шлём, отметка не ставится.
 *  4. Период уже истёк → не шлём (это забота крона автопродления).
 *  5. Отметка уже стоит → повторно не шлём.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

const { sentEmails } = vi.hoisted(() => ({
  sentEmails: [] as { to: string; subject: string; html: string; text: string }[],
}));

vi.mock("@/infrastructure/adapters/email", () => ({
  safeSendEmail: vi.fn(async (m) => void sentEmails.push(m)),
}));

import { prisma } from "@/infrastructure/db/client";
import { runSubscriptionReminders } from "@/infrastructure/jobs/subscription-reminders";

const PLAYER_ID = "33333333-0000-0000-0000-000000000001";
const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanup(): Promise<void> {
  const subs = await prisma.subscription.findMany({ where: { playerId: PLAYER_ID }, select: { id: true } });
  await prisma.payment.deleteMany({ where: { subscriptionId: { in: subs.map((s) => s.id) } } });
  await prisma.subscription.deleteMany({ where: { playerId: PLAYER_ID } });
}

async function makeSub(opts: {
  nextInDays: number;
  withCard: boolean;
  remindedAt?: Date | null;
}): Promise<void> {
  await prisma.subscription.create({
    data: {
      playerId: PLAYER_ID,
      status: "ACTIVE",
      planCode: "basic",
      currentPeriodStart: new Date(Date.now() - 27 * DAY_MS),
      nextPaymentAt: new Date(Date.now() + opts.nextInDays * DAY_MS),
      externalSubscriptionId: `ext_${PLAYER_ID}`,
      paymentMethodId: opts.withCard ? "pm_test" : null,
      renewalReminderSentAt: opts.remindedAt ?? null,
    },
  });
}

beforeAll(async () => {
  await prisma.player.upsert({
    where: { id: PLAYER_ID },
    update: {},
    create: { id: PLAYER_ID, email: "test-reminders@trener.local" },
  });
});

beforeEach(async () => {
  sentEmails.length = 0;
  vi.clearAllMocks();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.player.delete({ where: { id: PLAYER_ID } }).catch(() => {});
  await prisma.$disconnect();
});

describe("runSubscriptionReminders", () => {
  it("период в окне, есть карта → письмо о списании, отметка проставлена", async () => {
    await makeSub({ nextInDays: 2, withCard: true });

    const result = await runSubscriptionReminders(prisma);

    expect(result.sent).toBe(1);
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe("test-reminders@trener.local");
    expect(sentEmails[0].text).toMatch(/спишем|списан/i);

    const sub = await prisma.subscription.findFirst({ where: { playerId: PLAYER_ID } });
    expect(sub!.renewalReminderSentAt).not.toBeNull();
  });

  it("период в окне, без карты → письмо об истечении", async () => {
    await makeSub({ nextInDays: 1, withCard: false });

    await runSubscriptionReminders(prisma);

    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].text).toMatch(/истекает/i);
  });

  it("период далеко за окном → не шлём, отметка не ставится", async () => {
    await makeSub({ nextInDays: 10, withCard: true });

    const result = await runSubscriptionReminders(prisma);

    expect(result.sent).toBe(0);
    expect(sentEmails).toHaveLength(0);
    const sub = await prisma.subscription.findFirst({ where: { playerId: PLAYER_ID } });
    expect(sub!.renewalReminderSentAt).toBeNull();
  });

  it("период уже истёк → не шлём (забота автопродления)", async () => {
    await makeSub({ nextInDays: -1, withCard: true });

    const result = await runSubscriptionReminders(prisma);

    expect(result.sent).toBe(0);
    expect(sentEmails).toHaveLength(0);
  });

  it("отметка уже стоит → повторно не шлём", async () => {
    await makeSub({ nextInDays: 2, withCard: true, remindedAt: new Date() });

    const result = await runSubscriptionReminders(prisma);

    expect(result.sent).toBe(0);
    expect(sentEmails).toHaveLength(0);
  });
});

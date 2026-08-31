/**
 * Тест подбора получателей письма «подписка тратится впустую» (план
 * 2026-08-31-письма-редизайн-и-возврат-игрока). Бьёт в реальную тестовую базу (trener_test).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { findInactiveSubscriberCandidates } from "@/features/subscription/inactive-subscriber-email";
import { getInactiveSubscriberDays } from "@/config/lifecycle-emails";

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

const DAY_MS = 24 * 60 * 60 * 1000;
const thresholdDays = getInactiveSubscriberDays();

const PLAYER_STALE = "aaaaaaaa-3333-0000-0000-000000000001"; // последний турнир внутри окна тишины
const PLAYER_FRESH = "aaaaaaaa-3333-0000-0000-000000000002"; // грузил недавно
const PLAYER_NEVER_UPLOADED = "aaaaaaaa-3333-0000-0000-000000000003"; // ни разу не грузил, период начался давно
const PLAYER_ALREADY_SENT = "aaaaaaaa-3333-0000-0000-000000000004";
const ALL_PLAYERS = [PLAYER_STALE, PLAYER_FRESH, PLAYER_NEVER_UPLOADED, PLAYER_ALREADY_SENT];

async function makeActiveSub(playerId: string, currentPeriodStart: Date) {
  return prisma.subscription.create({
    data: {
      playerId,
      status: "ACTIVE",
      planCode: "basic",
      currentPeriodStart,
      nextPaymentAt: new Date(Date.now() + 20 * DAY_MS),
      externalSubscriptionId: `test-${playerId}`,
    },
  });
}

beforeAll(async () => {
  for (const id of ALL_PLAYERS) {
    await prisma.player.upsert({
      where: { id },
      update: { email: `${id}@trener.local`, locale: "ru" },
      create: { id, email: `${id}@trener.local`, locale: "ru" },
    });
  }
});

beforeEach(async () => {
  await prisma.subscription.deleteMany({ where: { playerId: { in: ALL_PLAYERS } } });
  await prisma.tournament.deleteMany({ where: { playerId: { in: ALL_PLAYERS } } });
});

afterAll(async () => {
  await prisma.subscription.deleteMany({ where: { playerId: { in: ALL_PLAYERS } } });
  await prisma.tournament.deleteMany({ where: { playerId: { in: ALL_PLAYERS } } });
  await prisma.player.deleteMany({ where: { id: { in: ALL_PLAYERS } } });
  await prisma.$disconnect();
});

describe("findInactiveSubscriberCandidates", () => {
  it("последний турнир внутри узкого окна тишины → кандидат", async () => {
    const sub = await makeActiveSub(PLAYER_STALE, new Date(Date.now() - 30 * DAY_MS));
    await prisma.tournament.create({
      data: {
        playerId: PLAYER_STALE,
        playedAt: new Date(),
        createdAt: new Date(Date.now() - (thresholdDays + 0.5) * DAY_MS),
      },
    });

    const candidates = await findInactiveSubscriberCandidates(prisma);
    expect(candidates.map((c) => c.subscriptionId)).toContain(sub.id);
  });

  it("грузил совсем недавно → не кандидат", async () => {
    const sub = await makeActiveSub(PLAYER_FRESH, new Date(Date.now() - 30 * DAY_MS));
    await prisma.tournament.create({
      data: { playerId: PLAYER_FRESH, playedAt: new Date(), createdAt: new Date() },
    });

    const candidates = await findInactiveSubscriberCandidates(prisma);
    expect(candidates.map((c) => c.subscriptionId)).not.toContain(sub.id);
  });

  it("ни разу не грузил, период начался ровно на пороге тишины → кандидат по дате начала периода", async () => {
    const periodStart = new Date(Date.now() - (thresholdDays + 0.5) * DAY_MS);
    const sub = await makeActiveSub(PLAYER_NEVER_UPLOADED, periodStart);

    const candidates = await findInactiveSubscriberCandidates(prisma);
    expect(candidates.map((c) => c.subscriptionId)).toContain(sub.id);
  });

  it("письмо уже отправлено за этот период → не кандидат повторно", async () => {
    const sub = await makeActiveSub(PLAYER_ALREADY_SENT, new Date(Date.now() - 30 * DAY_MS));
    await prisma.tournament.create({
      data: {
        playerId: PLAYER_ALREADY_SENT,
        playedAt: new Date(),
        createdAt: new Date(Date.now() - (thresholdDays + 0.5) * DAY_MS),
      },
    });
    await prisma.subscription.update({ where: { id: sub.id }, data: { inactivityReminderSentAt: new Date() } });

    const candidates = await findInactiveSubscriberCandidates(prisma);
    expect(candidates.map((c) => c.subscriptionId)).not.toContain(sub.id);
  });
});

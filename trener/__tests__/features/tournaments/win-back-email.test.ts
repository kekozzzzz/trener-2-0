/**
 * Тест подбора получателей письма-возврата (план
 * 2026-08-31-письма-редизайн-и-возврат-игрока). Бьёт в реальную тестовую базу (trener_test).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { findWinBackCandidates } from "@/features/tournaments/win-back-email";
import { getFreeTournamentLimit } from "@/config/plans";
import { getWinBackGraceDays } from "@/config/lifecycle-emails";

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

const DAY_MS = 24 * 60 * 60 * 1000;
const freeLimit = getFreeTournamentLimit();
const graceDays = getWinBackGraceDays();

const PLAYER_STALE = "aaaaaaaa-1111-0000-0000-000000000001"; // ровно лимит, старше порога → кандидат
const PLAYER_FRESH = "aaaaaaaa-1111-0000-0000-000000000002"; // ровно лимит, свежее порога → нет
const PLAYER_ALREADY_SENT = "aaaaaaaa-1111-0000-0000-000000000003"; // ровно лимит, старше порога, но письмо уже уходило
const PLAYER_SUBSCRIBED = "aaaaaaaa-1111-0000-0000-000000000004"; // ровно лимит, старше порога, но активная подписка
const ALL_PLAYERS = [PLAYER_STALE, PLAYER_FRESH, PLAYER_ALREADY_SENT, PLAYER_SUBSCRIBED];

async function makeTournaments(playerId: string, count: number, lastCreatedAt: Date) {
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const isLast = i === count - 1;
    await prisma.tournament.create({
      data: {
        playerId,
        playedAt: now,
        createdAt: isLast ? lastCreatedAt : new Date(now.getTime() - (count - i) * DAY_MS * 10),
        analysisUnlocked: true,
      },
    });
  }
}

beforeAll(async () => {
  for (const id of ALL_PLAYERS) {
    await prisma.player.upsert({
      where: { id },
      update: { email: `${id}@trener.local`, locale: "ru", winBackEmailSentAt: null, closedAt: null },
      create: { id, email: `${id}@trener.local`, locale: "ru" },
    });
  }
});

beforeEach(async () => {
  await prisma.tournament.deleteMany({ where: { playerId: { in: ALL_PLAYERS } } });
  await prisma.subscription.deleteMany({ where: { playerId: { in: ALL_PLAYERS } } });
  await prisma.player.updateMany({ where: { id: { in: ALL_PLAYERS } }, data: { winBackEmailSentAt: null } });
});

afterAll(async () => {
  await prisma.tournament.deleteMany({ where: { playerId: { in: ALL_PLAYERS } } });
  await prisma.subscription.deleteMany({ where: { playerId: { in: ALL_PLAYERS } } });
  await prisma.player.deleteMany({ where: { id: { in: ALL_PLAYERS } } });
  await prisma.$disconnect();
});

describe("findWinBackCandidates", () => {
  it("подбирает только тех, кто РОВНО на лимите и затих ВНУТРИ узкого окна вокруг порога", async () => {
    const stale = new Date(Date.now() - (graceDays + 0.5) * DAY_MS); // внутри окна [grace+1; grace]
    const fresh = new Date(Date.now() - (graceDays - 1) * DAY_MS); // ещё не дошёл до порога

    await makeTournaments(PLAYER_STALE, freeLimit, stale);
    await makeTournaments(PLAYER_FRESH, freeLimit, fresh);
    await makeTournaments(PLAYER_ALREADY_SENT, freeLimit, stale);
    await prisma.player.update({ where: { id: PLAYER_ALREADY_SENT }, data: { winBackEmailSentAt: new Date() } });

    const candidates = await findWinBackCandidates(prisma);
    const ids = candidates.map((c) => c.playerId);

    expect(ids).toContain(PLAYER_STALE);
    expect(ids).not.toContain(PLAYER_FRESH); // ещё не время
    expect(ids).not.toContain(PLAYER_ALREADY_SENT); // письмо уже уходило
  });

  it("старое молчание ВНЕ узкого окна (месяцы назад) — НЕ попадает (без ретроактивного залпа)", async () => {
    const ancient = new Date(Date.now() - (graceDays + 60) * DAY_MS);
    await makeTournaments(PLAYER_STALE, freeLimit, ancient);

    const candidates = await findWinBackCandidates(prisma);
    expect(candidates.map((c) => c.playerId)).not.toContain(PLAYER_STALE);
  });

  it("активная подписка → не кандидат, даже если по датам подошёл бы", async () => {
    const stale = new Date(Date.now() - (graceDays + 0.5) * DAY_MS);
    await makeTournaments(PLAYER_SUBSCRIBED, freeLimit, stale);
    await prisma.subscription.create({
      data: {
        playerId: PLAYER_SUBSCRIBED,
        status: "ACTIVE",
        planCode: "basic",
        currentPeriodStart: new Date(),
        nextPaymentAt: new Date(Date.now() + 25 * DAY_MS),
        externalSubscriptionId: `test-${PLAYER_SUBSCRIBED}`,
      },
    });

    const candidates = await findWinBackCandidates(prisma);
    expect(candidates.map((c) => c.playerId)).not.toContain(PLAYER_SUBSCRIBED);
  });
});

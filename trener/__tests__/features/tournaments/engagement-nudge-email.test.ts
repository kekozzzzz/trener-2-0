/**
 * Тест подбора получателей письма «разбор ждёт» (план
 * 2026-08-31-письма-редизайн-и-возврат-игрока). Бьёт в реальную тестовую базу (trener_test).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient, HandImportance } from "@prisma/client";
import { findEngagementNudgeCandidates } from "@/features/tournaments/engagement-nudge-email";
import { getEngagementNudgeHours } from "@/config/lifecycle-emails";

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

const HOUR_MS = 60 * 60 * 1000;
const thresholdHours = getEngagementNudgeHours();

const PLAYER_ID = "aaaaaaaa-2222-0000-0000-000000000001";

beforeAll(async () => {
  await prisma.player.upsert({
    where: { id: PLAYER_ID },
    update: { email: `${PLAYER_ID}@trener.local`, locale: "ru" },
    create: { id: PLAYER_ID, email: `${PLAYER_ID}@trener.local`, locale: "ru" },
  });
});

beforeEach(async () => {
  await prisma.tournament.deleteMany({ where: { playerId: PLAYER_ID } });
});

afterAll(async () => {
  await prisma.tournament.deleteMany({ where: { playerId: PLAYER_ID } });
  await prisma.player.delete({ where: { id: PLAYER_ID } }).catch(() => {});
  await prisma.$disconnect();
});

async function makeTournamentWithHand(opts: { createdAt: Date; viewedAt: Date | null; selectedForCard?: boolean }) {
  const tournament = await prisma.tournament.create({
    data: { playerId: PLAYER_ID, playedAt: opts.createdAt, createdAt: opts.createdAt, analysisUnlocked: true },
  });
  await prisma.hand.create({
    data: {
      tournamentId: tournament.id,
      importanceLevel: HandImportance.STRONG,
      chipResult: -100,
      tableData: {},
      selectedForCard: opts.selectedForCard ?? true,
      viewedAt: opts.viewedAt,
    },
  });
  return tournament;
}

describe("findEngagementNudgeCandidates", () => {
  it("турнир внутри узкого окна, ни одна раздача не открыта → кандидат", async () => {
    const createdAt = new Date(Date.now() - (thresholdHours + 1) * HOUR_MS);
    const t = await makeTournamentWithHand({ createdAt, viewedAt: null });

    const candidates = await findEngagementNudgeCandidates(prisma);
    expect(candidates.map((c) => c.tournamentId)).toContain(t.id);
  });

  it("хотя бы одна раздача открыта → не кандидат", async () => {
    const createdAt = new Date(Date.now() - (thresholdHours + 1) * HOUR_MS);
    const t = await makeTournamentWithHand({ createdAt, viewedAt: new Date() });

    const candidates = await findEngagementNudgeCandidates(prisma);
    expect(candidates.map((c) => c.tournamentId)).not.toContain(t.id);
  });

  it("турнир ещё СВЕЖЕЕ порога (только что загружен) → не кандидат", async () => {
    const createdAt = new Date(Date.now() - (thresholdHours - 1) * HOUR_MS);
    const t = await makeTournamentWithHand({ createdAt, viewedAt: null });

    const candidates = await findEngagementNudgeCandidates(prisma);
    expect(candidates.map((c) => c.tournamentId)).not.toContain(t.id);
  });

  it("старый непросмотренный турнир ВНЕ узкого окна (месяцы назад) — НЕ попадает (без ретроактивного залпа)", async () => {
    const ancient = new Date(Date.now() - (thresholdHours + 24 * 60) * HOUR_MS);
    const t = await makeTournamentWithHand({ createdAt: ancient, viewedAt: null });

    const candidates = await findEngagementNudgeCandidates(prisma);
    expect(candidates.map((c) => c.tournamentId)).not.toContain(t.id);
  });

  it("уже отправлено (engagementNudgeSentAt) → не кандидат повторно", async () => {
    const createdAt = new Date(Date.now() - (thresholdHours + 1) * HOUR_MS);
    const t = await makeTournamentWithHand({ createdAt, viewedAt: null });
    await prisma.tournament.update({ where: { id: t.id }, data: { engagementNudgeSentAt: new Date() } });

    const candidates = await findEngagementNudgeCandidates(prisma);
    expect(candidates.map((c) => c.tournamentId)).not.toContain(t.id);
  });
});

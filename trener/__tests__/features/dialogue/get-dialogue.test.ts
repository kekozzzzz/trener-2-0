/**
 * Тесты getDialogue (features/dialogue/queries.ts, [[2026-06-13-dialog-ui]]).
 *
 * Покрывают:
 *  1. Диалог не найден → null.
 *  2. QUESTION_ASKED с 2 раундами (1 отвечен, 2 — открыт) → rounds длиной 2,
 *     rounds[1].answer === null, verdict === null, totalRounds === getDialogueMaxRounds().
 *  3. VERDICT_SHOWN → verdict заполнен, все rounds[].answer заполнены.
 *  4. hand.played достаётся из hand.analysis.played, когда analysis есть,
 *     и null, когда analysis === null.
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";
import { getDialogue } from "@/features/dialogue/queries";
import { getDialogueMaxRounds } from "@/config/dialogue";

const TEST_PLAYER_ID = "eeeeeeee-0000-0000-0000-000000000001";

const db = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

const EMPTY_SNAPSHOT = { seats: [], heroCards: [], board: [], actions: [], potTotal: 0 };

async function createTournament(): Promise<string> {
  const tournament = await db.tournament.create({
    data: {
      playerId: TEST_PLAYER_ID,
      playedAt: new Date(),
      status: "PARSED",
      handsCount: 6,
      vpipPercent: 50,
      resultBuyins: -1,
      styleDiagnosis: "LOOSE",
    },
  });
  return tournament.id;
}

async function createHand(tournamentId: string, analysis: Record<string, unknown> | null): Promise<string> {
  const hand = await db.hand.create({
    data: {
      tournamentId,
      importanceLevel: "CRITICAL",
      chipResult: -100,
      tableData: EMPTY_SNAPSHOT as unknown as Prisma.InputJsonValue,
      selectedForCard: true,
      analysis: analysis as unknown as Prisma.InputJsonValue,
    },
  });
  return hand.id;
}

beforeAll(async () => {
  await db.player.upsert({
    where: { id: TEST_PLAYER_ID },
    update: {},
    create: { id: TEST_PLAYER_ID, email: "test-get-dialogue@trener.local" },
  });
});

beforeEach(async () => {
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
});

afterAll(async () => {
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await db.player.delete({ where: { id: TEST_PLAYER_ID } }).catch(() => {});
  await db.$disconnect();
  await prisma.$disconnect();
});

describe("getDialogue", () => {
  it("диалог не найден → null", async () => {
    const result = await getDialogue("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("QUESTION_ASKED с 2 раундами (1 отвечен, 2 — открыт)", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId, { played: "Колл на флопе с топ-парой." });

    await db.dialogue.create({
      data: {
        handId,
        state: "QUESTION_ASKED",
        rounds: {
          create: [
            { roundNumber: 1, question: "Почему коллировал?", answer: "Подумал, у него блеф." },
            { roundNumber: 2, question: "А что бы изменилось, если бы он рейзил?", answer: null },
          ],
        },
      },
    });

    const result = await getDialogue(handId);

    expect(result).not.toBeNull();
    expect(result!.state).toBe("QUESTION_ASKED");
    expect(result!.rounds).toHaveLength(2);
    expect(result!.rounds[0].answer).toBe("Подумал, у него блеф.");
    expect(result!.rounds[1].answer).toBeNull();
    expect(result!.verdict).toBeNull();
    expect(result!.totalRounds).toBe(getDialogueMaxRounds());
  });

  it("VERDICT_SHOWN — verdict заполнен, все rounds[].answer заполнены", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId, { played: "Олл-ин на ривере с овер-парой." });

    await db.dialogue.create({
      data: {
        handId,
        state: "VERDICT_SHOWN",
        verdict: "Решение разумное при таком стеке.",
        rounds: {
          create: [{ roundNumber: 1, question: "Почему пошёл олл-ин?", answer: "Считал, что у меня лучшая рука." }],
        },
      },
    });

    const result = await getDialogue(handId);

    expect(result).not.toBeNull();
    expect(result!.state).toBe("VERDICT_SHOWN");
    expect(result!.verdict).toBe("Решение разумное при таком стеке.");
    expect(result!.rounds.every((round) => round.answer !== null)).toBe(true);
  });

  it("hand.played достаётся из hand.analysis.played, когда analysis есть, и null, когда analysis === null", async () => {
    const tournamentId = await createTournament();

    const handWithAnalysis = await createHand(tournamentId, { played: "Рейз на префлопе с AK." });
    await db.dialogue.create({
      data: {
        handId: handWithAnalysis,
        state: "QUESTION_ASKED",
        rounds: { create: [{ roundNumber: 1, question: "Почему так?", answer: null }] },
      },
    });

    const handWithoutAnalysis = await createHand(tournamentId, null);
    await db.dialogue.create({
      data: {
        handId: handWithoutAnalysis,
        state: "QUESTION_ASKED",
        rounds: { create: [{ roundNumber: 1, question: "Почему так?", answer: null }] },
      },
    });

    const resultWithAnalysis = await getDialogue(handWithAnalysis);
    const resultWithoutAnalysis = await getDialogue(handWithoutAnalysis);

    expect(resultWithAnalysis!.hand.played).toBe("Рейз на префлопе с AK.");
    expect(resultWithoutAnalysis!.hand.played).toBeNull();
  });
});

/**
 * Тесты шага GENERATE_VERDICT.
 *
 * Покрывают:
 *  1. ANSWER_RECEIVED + draftVerdict — сохраняет verdict (по истории всех раундов),
 *     переводит в VERDICT_SHOWN.
 *  2. Идемпотентность: повторный вызов после VERDICT_SHOWN не переписывает verdict.
 *  3. Правило 2: state=QUESTION_ASKED (ответа нет) — бросает ошибку, verdict не пишется.
 *  4. Правило 2: последний раунд диалога ещё не достигнут — бросает ошибку.
 *  5. Без draftVerdict в analysis — понятная ошибка (GENERATE_HAND_ANALYSIS должен идти раньше).
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import type { HandImportance } from "@/parser/types";
import { generateVerdictStep } from "@/infrastructure/queue/steps/generate-verdict";

const TEST_PLAYER_ID = "cccccccc-0000-0000-0000-000000000001";

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

type HandOverrides = {
  importanceLevel?: HandImportance;
  analysis?: Record<string, unknown> | null;
};

async function createHand(tournamentId: string, overrides: HandOverrides = {}): Promise<string> {
  const hand = await db.hand.create({
    data: {
      tournamentId,
      importanceLevel: overrides.importanceLevel ?? "CRITICAL",
      chipResult: -100,
      tableData: EMPTY_SNAPSHOT as unknown as Prisma.InputJsonValue,
      selectedForCard: true,
      analysis: (overrides.analysis === undefined
        ? { played: "...", optimal: "...", question: "Почему так?", draftVerdict: "(черновик) вердикт" }
        : overrides.analysis) as unknown as Prisma.InputJsonValue,
    },
  });
  return hand.id;
}

type DialogueOverrides = {
  state?: "QUESTION_ASKED" | "ANSWER_RECEIVED" | "VERDICT_SHOWN";
  answer?: string | null;
  verdict?: string | null;
  roundNumber?: number;
};

async function createDialogue(handId: string, overrides: DialogueOverrides = {}): Promise<void> {
  await db.dialogue.create({
    data: {
      handId,
      verdict: overrides.verdict ?? null,
      state: overrides.state ?? "ANSWER_RECEIVED",
      rounds: {
        create: {
          roundNumber: overrides.roundNumber ?? 1,
          question: "Почему так?",
          answer: overrides.answer ?? "Потому что у меня был сильный диапазон.",
        },
      },
    },
  });
}

function makeRawTask(payload: Record<string, unknown>) {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    type: "GENERATE_VERDICT",
    payload,
    status: "PROCESSING",
    attempt: 1,
    run_after: new Date(),
    done_at: null,
    error: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

beforeAll(async () => {
  await db.player.upsert({
    where: { id: TEST_PLAYER_ID },
    update: {},
    create: { id: TEST_PLAYER_ID, email: "test-generate-verdict@trener.local" },
  });
});

beforeEach(async () => {
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
});

afterAll(async () => {
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await db.player.delete({ where: { id: TEST_PLAYER_ID } }).catch(() => {});
  await db.$disconnect();
});

describe("GENERATE_VERDICT", () => {
  it("сохраняет verdict и переводит ANSWER_RECEIVED → VERDICT_SHOWN", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, { state: "ANSWER_RECEIVED", answer: "Думал, что у него блеф." });

    await generateVerdictStep(makeRawTask({ handId }), db);

    const dialogue = await db.dialogue.findUnique({ where: { handId } });
    expect(dialogue!.state).toBe("VERDICT_SHOWN");
    expect(dialogue!.verdict).toBeTruthy();
    expect(dialogue!.verdict).toContain("Думал, что у него блеф.");
  });

  it("идемпотентность: повторный вызов после VERDICT_SHOWN не меняет verdict", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, { state: "ANSWER_RECEIVED" });

    await generateVerdictStep(makeRawTask({ handId }), db);
    const first = await db.dialogue.findUnique({ where: { handId } });

    await generateVerdictStep(makeRawTask({ handId }), db);
    const second = await db.dialogue.findUnique({ where: { handId } });

    expect(second!.verdict).toBe(first!.verdict);
    expect(second!.updatedAt).toEqual(first!.updatedAt);
  });

  it("правило 2: state=QUESTION_ASKED (ответа нет) — бросает ошибку, verdict не пишется", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, { state: "QUESTION_ASKED", answer: null });

    await expect(generateVerdictStep(makeRawTask({ handId }), db)).rejects.toThrow(/правила 2/);

    const dialogue = await db.dialogue.findUnique({ where: { handId } });
    expect(dialogue!.state).toBe("QUESTION_ASKED");
    expect(dialogue!.verdict).toBeNull();
  });

  it("без draftVerdict в analysis — понятная ошибка (GENERATE_HAND_ANALYSIS должен идти раньше)", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId, { analysis: { played: "...", optimal: "..." } });
    await createDialogue(handId, { state: "ANSWER_RECEIVED" });

    await expect(generateVerdictStep(makeRawTask({ handId }), db)).rejects.toThrow(/draftVerdict/);
  });

  it("правило 2: последний раунд диалога ещё не достигнут — бросает ошибку, verdict не пишется", async () => {
    const original = process.env.DIALOGUE_ROUNDS_PER_HAND;
    process.env.DIALOGUE_ROUNDS_PER_HAND = "3";
    try {
      const tournamentId = await createTournament();
      const handId = await createHand(tournamentId);
      await createDialogue(handId, { state: "ANSWER_RECEIVED", roundNumber: 1 });

      await expect(generateVerdictStep(makeRawTask({ handId }), db)).rejects.toThrow(/правила 2/);

      const dialogue = await db.dialogue.findUnique({ where: { handId } });
      expect(dialogue!.verdict).toBeNull();
    } finally {
      process.env.DIALOGUE_ROUNDS_PER_HAND = original;
    }
  });
});

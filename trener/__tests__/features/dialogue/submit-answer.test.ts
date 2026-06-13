/**
 * Тесты submitAnswer (architecture/04-потоки-данных.md, раздел 2, событие №4).
 *
 * Покрывают:
 *  1. Записывает ответ, переводит QUESTION_ASKED → ANSWER_RECEIVED, ставит GENERATE_VERDICT.
 *  2. Повторная отправка формы (уже ANSWER_RECEIVED) — не меняет ответ, не дублирует задачу.
 *  3. Пустой ответ — ошибка EMPTY_ANSWER, без изменений.
 *  4. Диалог не найден — ошибка DIALOGUE_NOT_FOUND.
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";
import { submitAnswer } from "@/features/dialogue/actions";

const TEST_PLAYER_ID = "dddddddd-0000-0000-0000-000000000001";

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

async function createHand(tournamentId: string): Promise<string> {
  const hand = await db.hand.create({
    data: {
      tournamentId,
      importanceLevel: "CRITICAL",
      chipResult: -100,
      tableData: EMPTY_SNAPSHOT as unknown as Prisma.InputJsonValue,
      selectedForCard: true,
      analysis: {
        played: "...",
        optimal: "...",
        question: "Почему так?",
        draftVerdict: "(черновик) вердикт",
      } as unknown as Prisma.InputJsonValue,
    },
  });
  return hand.id;
}

type DialogueOverrides = {
  state?: "QUESTION_ASKED" | "ANSWER_RECEIVED" | "VERDICT_SHOWN";
  answer?: string | null;
};

async function createDialogue(handId: string, overrides: DialogueOverrides = {}): Promise<void> {
  await db.dialogue.create({
    data: {
      handId,
      question: "Почему так?",
      answer: overrides.answer ?? null,
      state: overrides.state ?? "QUESTION_ASKED",
    },
  });
}

async function findVerdictTasks(handId: string) {
  const tasks = await db.task.findMany({ where: { type: "GENERATE_VERDICT" } });
  return tasks.filter((task) => (task.payload as { handId?: string }).handId === handId);
}

beforeAll(async () => {
  await db.player.upsert({
    where: { id: TEST_PLAYER_ID },
    update: {},
    create: { id: TEST_PLAYER_ID, email: "test-submit-answer@trener.local" },
  });
});

beforeEach(async () => {
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await db.task.deleteMany({ where: { type: "GENERATE_VERDICT" } });
});

afterAll(async () => {
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await db.task.deleteMany({ where: { type: "GENERATE_VERDICT" } });
  await db.player.delete({ where: { id: TEST_PLAYER_ID } }).catch(() => {});
  await db.$disconnect();
  await prisma.$disconnect();
});

describe("submitAnswer", () => {
  it("записывает ответ, переводит QUESTION_ASKED → ANSWER_RECEIVED и ставит GENERATE_VERDICT", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId);

    const result = await submitAnswer({ handId, answer: "Думал, что у него блеф." });

    expect(result).toEqual({ ok: true, state: "ANSWER_RECEIVED" });

    const dialogue = await db.dialogue.findUnique({ where: { handId } });
    expect(dialogue!.state).toBe("ANSWER_RECEIVED");
    expect(dialogue!.answer).toBe("Думал, что у него блеф.");

    const tasks = await findVerdictTasks(handId);
    expect(tasks).toHaveLength(1);
  });

  it("повторная отправка формы (уже ANSWER_RECEIVED) не меняет ответ и не дублирует задачу", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, { state: "ANSWER_RECEIVED", answer: "Первый ответ." });

    const result = await submitAnswer({ handId, answer: "Второй ответ." });

    expect(result).toEqual({ ok: true, state: "ANSWER_RECEIVED" });

    const dialogue = await db.dialogue.findUnique({ where: { handId } });
    expect(dialogue!.answer).toBe("Первый ответ.");

    const tasks = await findVerdictTasks(handId);
    expect(tasks).toHaveLength(0);
  });

  it("пустой ответ — ошибка EMPTY_ANSWER, без изменений", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId);

    const result = await submitAnswer({ handId, answer: "   " });

    expect(result).toEqual({ ok: false, error: "EMPTY_ANSWER" });

    const dialogue = await db.dialogue.findUnique({ where: { handId } });
    expect(dialogue!.state).toBe("QUESTION_ASKED");
    expect(dialogue!.answer).toBeNull();

    const tasks = await findVerdictTasks(handId);
    expect(tasks).toHaveLength(0);
  });

  it("диалог не найден — ошибка DIALOGUE_NOT_FOUND", async () => {
    const result = await submitAnswer({ handId: "00000000-0000-0000-0000-000000000000", answer: "Что-то" });

    expect(result).toEqual({ ok: false, error: "DIALOGUE_NOT_FOUND" });
  });
});

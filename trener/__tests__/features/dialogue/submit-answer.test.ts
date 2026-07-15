/**
 * Тесты submitAnswer (architecture/04-потоки-данных.md, раздел 2, событие №4).
 *
 * Покрывают:
 *  1. Записывает ответ, переводит QUESTION_ASKED → ANSWER_RECEIVED, ставит GENERATE_VERDICT
 *     (последний раунд — по умолчанию DIALOGUE_ROUNDS_PER_HAND=1, см. vitest.config.ts).
 *  2. Повторная отправка формы (уже ANSWER_RECEIVED) — не меняет ответ, не дублирует задачу.
 *  3. Пустой ответ — ошибка EMPTY_ANSWER, без изменений.
 *  4. Диалог не найден — ошибка DIALOGUE_NOT_FOUND.
 *  5. Раунд < DIALOGUE_ROUNDS_PER_HAND — ставит GENERATE_DIALOGUE_QUESTION вместо GENERATE_VERDICT.
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
  roundNumber?: number;
};

async function createDialogue(handId: string, overrides: DialogueOverrides = {}): Promise<void> {
  await db.dialogue.create({
    data: {
      handId,
      state: overrides.state ?? "QUESTION_ASKED",
      rounds: {
        create: {
          roundNumber: overrides.roundNumber ?? 1,
          question: "Почему так?",
          answer: overrides.answer ?? null,
        },
      },
    },
  });
}

async function findVerdictTasks(handId: string) {
  const tasks = await db.task.findMany({ where: { type: "GENERATE_VERDICT" } });
  return tasks.filter((task) => (task.payload as { handId?: string }).handId === handId);
}

async function findDialogueQuestionTasks(handId: string) {
  const tasks = await db.task.findMany({ where: { type: "GENERATE_DIALOGUE_QUESTION" } });
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
  await db.task.deleteMany({ where: { type: { in: ["GENERATE_VERDICT", "GENERATE_DIALOGUE_QUESTION"] } } });
});

afterAll(async () => {
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await db.task.deleteMany({ where: { type: { in: ["GENERATE_VERDICT", "GENERATE_DIALOGUE_QUESTION"] } } });
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

    const dialogue = await db.dialogue.findUnique({ where: { handId }, include: { rounds: true } });
    expect(dialogue!.state).toBe("ANSWER_RECEIVED");
    expect(dialogue!.rounds[0].answer).toBe("Думал, что у него блеф.");

    const tasks = await findVerdictTasks(handId);
    expect(tasks).toHaveLength(1);
  });

  it("повторная отправка формы (уже ANSWER_RECEIVED) не меняет ответ и не дублирует задачу", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, { state: "ANSWER_RECEIVED", answer: "Первый ответ." });

    const result = await submitAnswer({ handId, answer: "Второй ответ." });

    expect(result).toEqual({ ok: true, state: "ANSWER_RECEIVED" });

    const dialogue = await db.dialogue.findUnique({ where: { handId }, include: { rounds: true } });
    expect(dialogue!.rounds[0].answer).toBe("Первый ответ.");

    const tasks = await findVerdictTasks(handId);
    expect(tasks).toHaveLength(0);
  });

  it("пустой ответ — ошибка EMPTY_ANSWER, без изменений", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId);

    const result = await submitAnswer({ handId, answer: "   " });

    expect(result).toEqual({ ok: false, error: "EMPTY_ANSWER" });

    const dialogue = await db.dialogue.findUnique({ where: { handId }, include: { rounds: true } });
    expect(dialogue!.state).toBe("QUESTION_ASKED");
    expect(dialogue!.rounds[0].answer).toBeNull();

    const tasks = await findVerdictTasks(handId);
    expect(tasks).toHaveLength(0);
  });

  it("диалог не найден — ошибка DIALOGUE_NOT_FOUND", async () => {
    const result = await submitAnswer({ handId: "00000000-0000-0000-0000-000000000000", answer: "Что-то" });

    expect(result).toEqual({ ok: false, error: "DIALOGUE_NOT_FOUND" });
  });

  it("раунд < DIALOGUE_ROUNDS_PER_HAND ставит GENERATE_DIALOGUE_QUESTION, а не GENERATE_VERDICT", async () => {
    const original = process.env.DIALOGUE_ROUNDS_PER_HAND;
    const originalThin = process.env.DIALOGUE_ROUNDS_THIN_SPOT;
    process.env.DIALOGUE_ROUNDS_PER_HAND = "3";
    // Фикстура — пустой снимок (тонкий спот), поэтому поднимаем и тонкий потолок, иначе он (1)
    // форсит вердикт на раунде 1 и тест про многораундовый путь теряет смысл.
    process.env.DIALOGUE_ROUNDS_THIN_SPOT = "3";
    try {
      const tournamentId = await createTournament();
      const handId = await createHand(tournamentId);
      await createDialogue(handId, { roundNumber: 1 });

      const result = await submitAnswer({ handId, answer: "Думал, что у него блеф." });

      expect(result).toEqual({ ok: true, state: "ANSWER_RECEIVED" });

      const dialogue = await db.dialogue.findUnique({ where: { handId }, include: { rounds: true } });
      expect(dialogue!.state).toBe("ANSWER_RECEIVED");
      expect(dialogue!.rounds[0].answer).toBe("Думал, что у него блеф.");

      const verdictTasks = await findVerdictTasks(handId);
      expect(verdictTasks).toHaveLength(0);

      const questionTasks = await findDialogueQuestionTasks(handId);
      expect(questionTasks).toHaveLength(1);
      expect((questionTasks[0].payload as { roundNumber?: number }).roundNumber).toBe(1);
    } finally {
      process.env.DIALOGUE_ROUNDS_PER_HAND = original;
      process.env.DIALOGUE_ROUNDS_THIN_SPOT = originalThin;
    }
  });

  // Кап тонкого спота (2026-07-15): раздача без тяжёлого решения (пустой снимок → topDecisionMark
  // null) упирается в НИЗКИЙ потолок раньше полного — тренер не занудствует. Полный потолок 5 ещё
  // не достигнут (раунд 2), но тонкий (2) — да → вердикт, а не следующий вопрос.
  it("тонкий спот (нет тяжёлого решения) упирается в низкий потолок раньше полного", async () => {
    const origFull = process.env.DIALOGUE_ROUNDS_PER_HAND;
    const origThin = process.env.DIALOGUE_ROUNDS_THIN_SPOT;
    process.env.DIALOGUE_ROUNDS_PER_HAND = "5";
    process.env.DIALOGUE_ROUNDS_THIN_SPOT = "2";
    try {
      const tournamentId = await createTournament();
      const handId = await createHand(tournamentId); // EMPTY_SNAPSHOT → тонкий спот
      await createDialogue(handId, { roundNumber: 2 });

      const result = await submitAnswer({ handId, answer: "Хотел добрать чек." });
      expect(result).toEqual({ ok: true, state: "ANSWER_RECEIVED" });

      // Тонкий потолок 2 достигнут → вердикт принудительно, хотя полный (5) далеко.
      expect(await findVerdictTasks(handId)).toHaveLength(1);
      expect(await findDialogueQuestionTasks(handId)).toHaveLength(0);
    } finally {
      process.env.DIALOGUE_ROUNDS_PER_HAND = origFull;
      process.env.DIALOGUE_ROUNDS_THIN_SPOT = origThin;
    }
  });
});

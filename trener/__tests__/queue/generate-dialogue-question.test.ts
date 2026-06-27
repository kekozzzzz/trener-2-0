/**
 * Тесты шага GENERATE_DIALOGUE_QUESTION.
 *
 * Покрывают:
 *  1. ANSWER_RECEIVED + draftVerdict, раунд < DIALOGUE_ROUNDS_PER_HAND — создаёт следующий
 *     раунд с вопросом, переводит диалог в QUESTION_ASKED.
 *  1b. ИИ решил «диалог исчерпан» (complete) — раунд не создаётся, ставится GENERATE_VERDICT.
 *  2. Идемпотентность: следующий раунд уже создан — платный вызов пропускается.
 *  3. Правило 2: state=QUESTION_ASKED (ответа на текущий раунд нет) — бросает ошибку.
 *  4. Без draftVerdict в analysis — понятная ошибка (GENERATE_HAND_ANALYSIS должен идти раньше).
 *
 * Использует DIALOGUE_ROUNDS_PER_HAND=3 (по умолчанию в vitest.config.ts — 1,
 * этого шага без многораундового диалога не бывает).
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import type { HandImportance } from "@/parser/types";
import { generateDialogueQuestionStep } from "@/infrastructure/queue/steps/generate-dialogue-question";

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
};

async function createDialogue(handId: string, overrides: DialogueOverrides = {}): Promise<string> {
  const dialogue = await db.dialogue.create({
    data: {
      handId,
      verdict: null,
      state: overrides.state ?? "ANSWER_RECEIVED",
      rounds: {
        create: {
          roundNumber: 1,
          question: "Почему так?",
          answer: overrides.answer === undefined ? "Потому что у меня был сильный диапазон." : overrides.answer,
        },
      },
    },
  });
  return dialogue.id;
}

function makeRawTask(payload: Record<string, unknown>) {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    type: "GENERATE_DIALOGUE_QUESTION",
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

let originalRoundsPerHand: string | undefined;

beforeAll(async () => {
  originalRoundsPerHand = process.env.DIALOGUE_ROUNDS_PER_HAND;
  process.env.DIALOGUE_ROUNDS_PER_HAND = "3";

  await db.player.upsert({
    where: { id: TEST_PLAYER_ID },
    update: {},
    create: { id: TEST_PLAYER_ID, email: "test-generate-dialogue-question@trener.local" },
  });
});

beforeEach(async () => {
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
});

afterAll(async () => {
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await db.player.delete({ where: { id: TEST_PLAYER_ID } }).catch(() => {});
  await db.$disconnect();
  process.env.DIALOGUE_ROUNDS_PER_HAND = originalRoundsPerHand;
});

// Фильтруем по handId — тестовая БД общая с другими файлами, глобальную чистку
// задач делать нельзя (сотрёт задачу, которую в этот момент берёт чужой воркер).
async function findVerdictTasks(handId: string) {
  const tasks = await db.task.findMany({ where: { type: "GENERATE_VERDICT" } });
  return tasks.filter((task) => (task.payload as { handId?: string }).handId === handId);
}

describe("GENERATE_DIALOGUE_QUESTION", () => {
  it("создаёт раунд 2 с вопросом и переводит диалог в QUESTION_ASKED", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, { state: "ANSWER_RECEIVED" });

    await generateDialogueQuestionStep(makeRawTask({ handId, roundNumber: 1 }), db);

    const dialogue = await db.dialogue.findUnique({
      where: { handId },
      include: { rounds: { orderBy: { roundNumber: "asc" } } },
    });
    expect(dialogue!.state).toBe("QUESTION_ASKED");
    expect(dialogue!.rounds).toHaveLength(2);
    expect(dialogue!.rounds[1].roundNumber).toBe(2);
    expect(dialogue!.rounds[1].question).toBeTruthy();
    expect(dialogue!.rounds[1].answer).toBeNull();
  });

  it("ИИ решил «диалог исчерпан» — раунд не создаётся, ставится GENERATE_VERDICT, state остаётся ANSWER_RECEIVED", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    // Фейк-адаптер завершает диалог, когда в ответе есть «понял» (в проде это решает Claude).
    await createDialogue(handId, { state: "ANSWER_RECEIVED", answer: "Теперь понял свою ошибку." });

    await generateDialogueQuestionStep(makeRawTask({ handId, roundNumber: 1 }), db);

    const dialogue = await db.dialogue.findUnique({
      where: { handId },
      include: { rounds: { orderBy: { roundNumber: "asc" } } },
    });
    // Раунд не добавлен, состояние под вердикт (правило 2: вердикт после ответа).
    expect(dialogue!.rounds).toHaveLength(1);
    expect(dialogue!.state).toBe("ANSWER_RECEIVED");
    expect(dialogue!.verdict).toBeNull();

    const verdictTasks = await findVerdictTasks(handId);
    expect(verdictTasks).toHaveLength(1);
  });

  it("идемпотентность: раунд 2 уже создан — повторный вызов ничего не меняет", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    const dialogueId = await createDialogue(handId, { state: "ANSWER_RECEIVED" });

    await db.dialogueRound.create({
      data: { dialogueId, roundNumber: 2, question: "Уже сгенерированный вопрос" },
    });
    await db.dialogue.update({ where: { handId }, data: { state: "QUESTION_ASKED" } });

    await generateDialogueQuestionStep(makeRawTask({ handId, roundNumber: 1 }), db);

    const dialogue = await db.dialogue.findUnique({
      where: { handId },
      include: { rounds: { orderBy: { roundNumber: "asc" } } },
    });
    expect(dialogue!.rounds).toHaveLength(2);
    expect(dialogue!.rounds[1].question).toBe("Уже сгенерированный вопрос");
  });

  it("правило 2: state=QUESTION_ASKED (ответа на текущий раунд нет) — бросает ошибку", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, { state: "QUESTION_ASKED", answer: null });

    await expect(generateDialogueQuestionStep(makeRawTask({ handId, roundNumber: 1 }), db)).rejects.toThrow(
      /правила 2/
    );

    const dialogue = await db.dialogue.findUnique({ where: { handId }, include: { rounds: true } });
    expect(dialogue!.rounds).toHaveLength(1);
  });

  it("без draftVerdict в analysis — понятная ошибка (GENERATE_HAND_ANALYSIS должен идти раньше)", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId, { analysis: { played: "...", optimal: "..." } });
    await createDialogue(handId, { state: "ANSWER_RECEIVED" });

    await expect(generateDialogueQuestionStep(makeRawTask({ handId, roundNumber: 1 }), db)).rejects.toThrow(
      /draftVerdict/
    );
  });
});

/**
 * Тесты шага GENERATE_CHAT_REPLY.
 *
 * Покрывают:
 *  1. Идемпотентность: нет сообщений в треде — выход без действий.
 *  2. Идемпотентность: последнее сообщение от SYSTEM — выход без действий.
 *  3. Гейт чата: dialogue.state !== VERDICT_SHOWN при сообщении от PLAYER — ошибка-инвариант.
 *  4. Успех: VERDICT_SHOWN + последнее сообщение от PLAYER — создаёт ChatMessage{SYSTEM}
 *     через fakeLlmAdapter.
 *  5. Без played/optimal в analysis — понятная ошибка (GENERATE_HAND_ANALYSIS должен идти раньше).
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { generateChatReplyStep } from "@/infrastructure/queue/steps/generate-chat-reply";

const TEST_PLAYER_ID = "ffffffff-0000-0000-0000-000000000001";

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
  analysis?: Record<string, unknown> | null;
};

async function createHand(tournamentId: string, overrides: HandOverrides = {}): Promise<string> {
  const hand = await db.hand.create({
    data: {
      tournamentId,
      importanceLevel: "CRITICAL",
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

async function createDialogue(handId: string, state: "QUESTION_ASKED" | "ANSWER_RECEIVED" | "VERDICT_SHOWN"): Promise<void> {
  await db.dialogue.create({
    data: {
      handId,
      state,
      verdict: state === "VERDICT_SHOWN" ? "Решение разумное при таком стеке." : null,
      rounds: {
        create: {
          roundNumber: 1,
          question: "Почему так?",
          answer: state === "QUESTION_ASKED" ? null : "Думал, что у него блеф.",
        },
      },
    },
  });
}

async function createChatMessage(handId: string, author: "PLAYER" | "SYSTEM", text: string): Promise<void> {
  await db.chatMessage.create({ data: { handId, author, text } });
}

function makeRawTask(payload: Record<string, unknown>) {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    type: "GENERATE_CHAT_REPLY",
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
    create: { id: TEST_PLAYER_ID, email: "test-generate-chat-reply@trener.local" },
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

describe("GENERATE_CHAT_REPLY", () => {
  it("идемпотентность: нет сообщений в треде — выход без действий", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, "VERDICT_SHOWN");

    await generateChatReplyStep(makeRawTask({ handId }), db);

    const messages = await db.chatMessage.findMany({ where: { handId } });
    expect(messages).toHaveLength(0);
  });

  it("идемпотентность: последнее сообщение от SYSTEM — выход без действий", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, "VERDICT_SHOWN");
    await createChatMessage(handId, "PLAYER", "А что если бы он рейзил?");
    await createChatMessage(handId, "SYSTEM", "(фейк) Ответ уже дан.");

    await generateChatReplyStep(makeRawTask({ handId }), db);

    const messages = await db.chatMessage.findMany({ where: { handId } });
    expect(messages).toHaveLength(2);
  });

  it("гейт чата: dialogue.state !== VERDICT_SHOWN при сообщении от PLAYER — ошибка-инвариант", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, "ANSWER_RECEIVED");
    await createChatMessage(handId, "PLAYER", "А что если бы он рейзил?");

    await expect(generateChatReplyStep(makeRawTask({ handId }), db)).rejects.toThrow(/VERDICT_SHOWN/);

    const messages = await db.chatMessage.findMany({ where: { handId } });
    expect(messages).toHaveLength(1);
  });

  it("успех: VERDICT_SHOWN + последнее сообщение от PLAYER — создаёт ChatMessage{SYSTEM}", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, "VERDICT_SHOWN");
    await createChatMessage(handId, "PLAYER", "А что если бы он рейзил?");

    await generateChatReplyStep(makeRawTask({ handId }), db);

    const messages = await db.chatMessage.findMany({ where: { handId }, orderBy: { createdAt: "asc" } });
    expect(messages).toHaveLength(2);
    expect(messages[1].author).toBe("SYSTEM");
    expect(messages[1].text).toContain("А что если бы он рейзил?");
  });

  it("без played/optimal в analysis — понятная ошибка (GENERATE_HAND_ANALYSIS должен идти раньше)", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId, { analysis: { note: "..." } });
    await createDialogue(handId, "VERDICT_SHOWN");
    await createChatMessage(handId, "PLAYER", "А что если бы он рейзил?");

    await expect(generateChatReplyStep(makeRawTask({ handId }), db)).rejects.toThrow(/played\/optimal/);
  });
});

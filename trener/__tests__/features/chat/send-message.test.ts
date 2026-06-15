/**
 * Тесты sendChatMessage (features/chat/actions.ts, [[2026-06-15-чат-по-раздаче]]).
 *
 * Покрывают:
 *  1. Раздача не найдена → HAND_NOT_FOUND.
 *  2. Нет Dialogue (STRONG/MEDIUM раздача) → CHAT_NOT_AVAILABLE.
 *  3. Dialogue есть, но state !== VERDICT_SHOWN → CHAT_NOT_AVAILABLE.
 *  4. Пустое сообщение → EMPTY_MESSAGE, без изменений.
 *  5. Последнее сообщение от PLAYER без ответа → AWAITING_REPLY, не дублирует задачу.
 *  6. Успешная отправка → создаёт ChatMessage{PLAYER} и ставит GENERATE_CHAT_REPLY.
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";
import { sendChatMessage } from "@/features/chat/actions";

const TEST_PLAYER_ID = "22222222-0000-0000-0000-000000000002";

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
      analysis: { played: "...", optimal: "..." } as unknown as Prisma.InputJsonValue,
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

async function findChatReplyTasks(handId: string) {
  const tasks = await db.task.findMany({ where: { type: "GENERATE_CHAT_REPLY" } });
  return tasks.filter((task) => (task.payload as { handId?: string }).handId === handId);
}

beforeAll(async () => {
  await db.player.upsert({
    where: { id: TEST_PLAYER_ID },
    update: {},
    create: { id: TEST_PLAYER_ID, email: "test-send-chat-message@trener.local" },
  });
});

beforeEach(async () => {
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await db.task.deleteMany({ where: { type: "GENERATE_CHAT_REPLY" } });
});

afterAll(async () => {
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await db.task.deleteMany({ where: { type: "GENERATE_CHAT_REPLY" } });
  await db.player.delete({ where: { id: TEST_PLAYER_ID } }).catch(() => {});
  await db.$disconnect();
  await prisma.$disconnect();
});

describe("sendChatMessage", () => {
  it("раздача не найдена → HAND_NOT_FOUND", async () => {
    const result = await sendChatMessage({ handId: "00000000-0000-0000-0000-000000000000", text: "Вопрос" });

    expect(result).toEqual({ ok: false, error: "HAND_NOT_FOUND" });
  });

  it("нет Dialogue (STRONG/MEDIUM раздача) → CHAT_NOT_AVAILABLE", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);

    const result = await sendChatMessage({ handId, text: "Вопрос" });

    expect(result).toEqual({ ok: false, error: "CHAT_NOT_AVAILABLE" });
  });

  it("Dialogue есть, но state !== VERDICT_SHOWN → CHAT_NOT_AVAILABLE", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, "QUESTION_ASKED");

    const result = await sendChatMessage({ handId, text: "Вопрос" });

    expect(result).toEqual({ ok: false, error: "CHAT_NOT_AVAILABLE" });

    const tasks = await findChatReplyTasks(handId);
    expect(tasks).toHaveLength(0);
  });

  it("пустое сообщение → EMPTY_MESSAGE, без изменений", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, "VERDICT_SHOWN");

    const result = await sendChatMessage({ handId, text: "   " });

    expect(result).toEqual({ ok: false, error: "EMPTY_MESSAGE" });

    const messages = await db.chatMessage.findMany({ where: { handId } });
    expect(messages).toHaveLength(0);
  });

  it("сообщение длиннее лимита → MESSAGE_TOO_LONG, без изменений", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, "VERDICT_SHOWN");

    const result = await sendChatMessage({ handId, text: "a".repeat(501) });

    expect(result).toEqual({ ok: false, error: "MESSAGE_TOO_LONG" });

    const messages = await db.chatMessage.findMany({ where: { handId } });
    expect(messages).toHaveLength(0);

    const tasks = await findChatReplyTasks(handId);
    expect(tasks).toHaveLength(0);
  });

  it("последнее сообщение от PLAYER без ответа → AWAITING_REPLY, не дублирует задачу", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, "VERDICT_SHOWN");
    await db.chatMessage.create({ data: { handId, author: "PLAYER", text: "Первый вопрос" } });

    const result = await sendChatMessage({ handId, text: "Второй вопрос" });

    expect(result).toEqual({ ok: false, error: "AWAITING_REPLY" });

    const messages = await db.chatMessage.findMany({ where: { handId } });
    expect(messages).toHaveLength(1);

    const tasks = await findChatReplyTasks(handId);
    expect(tasks).toHaveLength(0);
  });

  it("успешная отправка → создаёт ChatMessage{PLAYER} и ставит GENERATE_CHAT_REPLY", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, "VERDICT_SHOWN");

    const result = await sendChatMessage({ handId, text: "А что если бы он рейзил?" });

    expect(result).toEqual({ ok: true });

    const messages = await db.chatMessage.findMany({ where: { handId } });
    expect(messages).toHaveLength(1);
    expect(messages[0].author).toBe("PLAYER");
    expect(messages[0].text).toBe("А что если бы он рейзил?");

    const tasks = await findChatReplyTasks(handId);
    expect(tasks).toHaveLength(1);
  });
});

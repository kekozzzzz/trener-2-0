/**
 * Тесты getChat (features/chat/queries.ts, [[2026-06-15-чат-по-раздаче]]).
 *
 * Покрывают:
 *  1. Раздача не найдена → null.
 *  2. Нет Dialogue (STRONG/MEDIUM раздача) → available === false.
 *  3. Dialogue есть, но state !== VERDICT_SHOWN → available === false.
 *  4. VERDICT_SHOWN, сообщений нет → available === true, awaitingReply === false, messages === [].
 *  5. VERDICT_SHOWN, последнее сообщение от PLAYER → awaitingReply === true.
 *  6. VERDICT_SHOWN, последнее сообщение от SYSTEM → awaitingReply === false, messages в порядке создания.
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";
import { getChat } from "@/features/chat/queries";

const TEST_PLAYER_ID = "11111111-0000-0000-0000-000000000002";

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

beforeAll(async () => {
  await db.player.upsert({
    where: { id: TEST_PLAYER_ID },
    update: {},
    create: { id: TEST_PLAYER_ID, email: "test-get-chat@trener.local" },
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

describe("getChat", () => {
  it("раздача не найдена → null", async () => {
    const result = await getChat("00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("нет Dialogue (STRONG/MEDIUM раздача) → available === false", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);

    const result = await getChat(handId);

    expect(result).toEqual({ available: false, awaitingReply: false, messages: [] });
  });

  it("Dialogue есть, но state !== VERDICT_SHOWN → available === false", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, "QUESTION_ASKED");

    const result = await getChat(handId);

    expect(result!.available).toBe(false);
  });

  it("VERDICT_SHOWN, сообщений нет → available === true, awaitingReply === false, messages === []", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, "VERDICT_SHOWN");

    const result = await getChat(handId);

    expect(result).toEqual({ available: true, awaitingReply: false, messages: [] });
  });

  it("VERDICT_SHOWN, последнее сообщение от PLAYER → awaitingReply === true", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, "VERDICT_SHOWN");
    await db.chatMessage.create({ data: { handId, author: "PLAYER", text: "А что если бы он рейзил?" } });

    const result = await getChat(handId);

    expect(result!.awaitingReply).toBe(true);
    expect(result!.messages).toHaveLength(1);
  });

  it("VERDICT_SHOWN, последнее сообщение от SYSTEM → awaitingReply === false, messages в порядке создания", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId);
    await createDialogue(handId, "VERDICT_SHOWN");
    await db.chatMessage.create({ data: { handId, author: "PLAYER", text: "А что если бы он рейзил?" } });
    await db.chatMessage.create({ data: { handId, author: "SYSTEM", text: "(фейк) Ответ." } });

    const result = await getChat(handId);

    expect(result!.awaitingReply).toBe(false);
    expect(result!.messages).toHaveLength(2);
    expect(result!.messages[0].author).toBe("PLAYER");
    expect(result!.messages[1].author).toBe("SYSTEM");
  });
});

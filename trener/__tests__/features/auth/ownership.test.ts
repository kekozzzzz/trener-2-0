/**
 * Тесты authorizeHand (features/auth/ownership.ts) — проверка прав на раздачу,
 * закрывает IDOR в чате/диалоге (architecture/07-безопасность.md, раздел 2).
 *
 * Покрывают:
 *  1. Нет сессии → null.
 *  2. Сессия чужого игрока (раздача принадлежит другому) → null.
 *  3. Раздача не найдена → null.
 *  4. Турнир мягко удалён (deletedAt) → null.
 *  5. Свой игрок, живая раздача → { playerId }.
 *
 * getSession мокаем (cookie-слой проверен в session.test.ts), prisma — реальная
 * тестовая база (trener_test), как в остальных feature-тестах.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";

const OWNER_ID = "11111111-0000-0000-0000-000000000003";
const INTRUDER_ID = "11111111-0000-0000-0000-000000000004";

const { sessionRef } = vi.hoisted(() => ({
  sessionRef: { value: null as { playerId: string } | null },
}));

vi.mock("@/features/auth/session", () => ({
  getSession: async () => sessionRef.value,
}));

import { authorizeHand } from "@/features/auth/ownership";

const db = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

const EMPTY_SNAPSHOT = { seats: [], heroCards: [], board: [], actions: [], potTotal: 0 };

async function createHand(deleted = false): Promise<string> {
  const tournament = await db.tournament.create({
    data: {
      playerId: OWNER_ID,
      playedAt: new Date(),
      status: "PARSED",
      deletedAt: deleted ? new Date() : null,
    },
  });
  const hand = await db.hand.create({
    data: {
      tournamentId: tournament.id,
      importanceLevel: "CRITICAL",
      chipResult: -100,
      tableData: EMPTY_SNAPSHOT as unknown as Prisma.InputJsonValue,
    },
  });
  return hand.id;
}

beforeAll(async () => {
  await db.player.upsert({
    where: { id: OWNER_ID },
    update: {},
    create: { id: OWNER_ID, email: "test-ownership@trener.local" },
  });
});

beforeEach(async () => {
  sessionRef.value = null;
  await db.tournament.deleteMany({ where: { playerId: OWNER_ID } });
});

afterAll(async () => {
  await db.tournament.deleteMany({ where: { playerId: OWNER_ID } });
  await db.player.delete({ where: { id: OWNER_ID } }).catch(() => {});
  await db.$disconnect();
  await prisma.$disconnect();
});

describe("authorizeHand", () => {
  it("нет сессии → null", async () => {
    const handId = await createHand();
    sessionRef.value = null;

    expect(await authorizeHand(handId)).toBeNull();
  });

  it("сессия чужого игрока → null", async () => {
    const handId = await createHand();
    sessionRef.value = { playerId: INTRUDER_ID };

    expect(await authorizeHand(handId)).toBeNull();
  });

  it("раздача не найдена → null", async () => {
    sessionRef.value = { playerId: OWNER_ID };

    expect(await authorizeHand("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("турнир мягко удалён → null", async () => {
    const handId = await createHand(true);
    sessionRef.value = { playerId: OWNER_ID };

    expect(await authorizeHand(handId)).toBeNull();
  });

  it("свой игрок, живая раздача → { playerId }", async () => {
    const handId = await createHand();
    sessionRef.value = { playerId: OWNER_ID };

    expect(await authorizeHand(handId)).toEqual({ playerId: OWNER_ID });
  });
});

/**
 * Тесты шага GENERATE_PLAYER_CHARACTERISTIC
 * (plans/2026-06-25-характеристика-игрока.md).
 *
 * Покрывают:
 *  1. Успех: собирает характеристику по всем турнирам игрока (fake-адаптер),
 *     заполняет PlayerProfile (текст + средние + счётчик).
 *  2. Идемпотентность: набор турниров не изменился и текст есть — не перезаписывает.
 *  3. Добавился турнир (счётчик вырос) — пересобирает.
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient, type Prisma, type PlayerStyle } from "@prisma/client";
import type { RawTask } from "@/infrastructure/queue/types";
import { generatePlayerCharacteristicStep } from "@/infrastructure/queue/steps/generate-player-characteristic";

const TEST_PLAYER_ID = "cccccccc-0000-0000-0000-000000000002";

const db = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

const EMPTY_SNAPSHOT = { seats: [], heroCards: [], board: [], actions: [], potTotal: 0 };

async function createTournament(style: PlayerStyle = "AGGRESSIVE"): Promise<string> {
  const tournament = await db.tournament.create({
    data: {
      playerId: TEST_PLAYER_ID,
      playedAt: new Date(),
      status: "CARD_READY",
      handsCount: 100,
      vpipPercent: 40,
      resultBuyins: -1,
      styleDiagnosis: style,
    },
  });
  await db.hand.create({
    data: {
      tournamentId: tournament.id,
      importanceLevel: "STRONG",
      chipResult: -100,
      tableData: EMPTY_SNAPSHOT as unknown as Prisma.InputJsonValue,
      selectedForCard: true,
    },
  });
  return tournament.id;
}

function makeRawTask(payload: Record<string, unknown>): RawTask {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    type: "GENERATE_PLAYER_CHARACTERISTIC",
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
    create: { id: TEST_PLAYER_ID, email: "test-player-characteristic@trener.local" },
  });
});

beforeEach(async () => {
  await db.playerProfile.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
});

afterAll(async () => {
  await db.playerProfile.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await db.player.delete({ where: { id: TEST_PLAYER_ID } }).catch(() => {});
  await db.$disconnect();
});

describe("GENERATE_PLAYER_CHARACTERISTIC", () => {
  it("собирает характеристику по всем турнирам и заполняет профиль", async () => {
    await createTournament();
    await createTournament();

    await generatePlayerCharacteristicStep(makeRawTask({ playerId: TEST_PLAYER_ID }), db);

    const profile = await db.playerProfile.findUnique({ where: { playerId: TEST_PLAYER_ID } });
    expect(profile).not.toBeNull();
    expect(typeof profile!.characteristic).toBe("string");
    expect(profile!.characteristic!.length).toBeGreaterThan(0);
    expect(profile!.tournamentsCounted).toBe(2);
    expect(Number(profile!.avgVpip)).toBe(40);
    expect(profile!.recalculatedAt).not.toBeNull();
  });

  it("идемпотентность: набор турниров не изменился — не перезаписывает", async () => {
    await createTournament();
    await db.playerProfile.create({
      data: { playerId: TEST_PLAYER_ID, characteristic: "уже готово", tournamentsCounted: 1 },
    });

    await generatePlayerCharacteristicStep(makeRawTask({ playerId: TEST_PLAYER_ID }), db);

    const profile = await db.playerProfile.findUnique({ where: { playerId: TEST_PLAYER_ID } });
    expect(profile!.characteristic).toBe("уже готово");
  });

  it("добавился турнир (счётчик вырос) — пересобирает", async () => {
    await createTournament();
    await db.playerProfile.create({
      data: { playerId: TEST_PLAYER_ID, characteristic: "старое", tournamentsCounted: 1 },
    });
    await createTournament(); // теперь турниров 2, счётчик в профиле = 1

    await generatePlayerCharacteristicStep(makeRawTask({ playerId: TEST_PLAYER_ID }), db);

    const profile = await db.playerProfile.findUnique({ where: { playerId: TEST_PLAYER_ID } });
    expect(profile!.characteristic).not.toBe("старое");
    expect(profile!.tournamentsCounted).toBe(2);
  });
});

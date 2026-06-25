/**
 * Тесты шага GENERATE_TOURNAMENT_SUMMARY (plans/2026-06-17-обзор-турнира.md).
 *
 * Покрывают:
 *  1. Успех: собирает overview + моменты, мапит индексы LLM в handId раздач карточки
 *     (fake-адаптер, без сети и расходов).
 *  2. Идемпотентность: summary уже сохранён — повторный вызов не перезаписывает.
 *  3. Нет раздач карточки с разбором — summary остаётся null (нечего обобщать).
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import type { RawTask } from "@/infrastructure/queue/types";
import { generateTournamentSummaryStep } from "@/infrastructure/queue/steps/generate-tournament-summary";

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
      status: "CARD_READY",
      handsCount: 6,
      vpipPercent: 50,
      resultBuyins: -1,
      styleDiagnosis: "LOOSE",
    },
  });
  return tournament.id;
}

async function createCardHand(tournamentId: string, chipResult: number, withAnalysis = true): Promise<string> {
  const hand = await db.hand.create({
    data: {
      tournamentId,
      importanceLevel: "STRONG",
      chipResult,
      tableData: EMPTY_SNAPSHOT as unknown as Prisma.InputJsonValue,
      selectedForCard: true,
      analysis: withAnalysis
        ? ({ played: "сыграл так", optimal: "можно было так", note: "заметка" } as unknown as Prisma.InputJsonValue)
        : undefined,
    },
  });
  return hand.id;
}

function makeRawTask(payload: Record<string, unknown>): RawTask {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    type: "GENERATE_TOURNAMENT_SUMMARY",
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
    create: { id: TEST_PLAYER_ID, email: "test-tournament-summary@trener.local" },
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

describe("GENERATE_TOURNAMENT_SUMMARY", () => {
  it("собирает overview, мапит токены {{h:N}} в handId раздач карточки", async () => {
    const tournamentId = await createTournament();
    // Порядок создания = порядок индексов, на который ссылается LLM токенами.
    const handIds = [
      await createCardHand(tournamentId, -300),
      await createCardHand(tournamentId, -200),
      await createCardHand(tournamentId, -100),
    ];

    await generateTournamentSummaryStep(makeRawTask({ tournamentId }), db);

    const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
    const summary = tournament!.summary as { overview: string };

    expect(typeof summary.overview).toBe("string");
    expect(summary.overview.length).toBeGreaterThan(0);
    // fake-адаптер ставит токены на первые 3 раздачи (индексы 0..2) → реальные handId
    // вида {{h:<handId>|карты}}; пустой снимок даёт подпись «раздача».
    handIds.forEach((handId) => {
      expect(summary.overview).toContain(`{{h:${handId}|`);
    });
    // Индексов 0..2 → токенов после замены нет (все заменены на handId).
    expect(summary.overview).not.toMatch(/\{\{h:\d+\}\}/);
  });

  it("идемпотентность: summary уже сохранён — не перезаписывает", async () => {
    const tournamentId = await createTournament();
    await createCardHand(tournamentId, -100);
    await db.tournament.update({
      where: { id: tournamentId },
      data: { summary: { overview: "уже готово" } as unknown as Prisma.InputJsonValue },
    });

    await generateTournamentSummaryStep(makeRawTask({ tournamentId }), db);

    const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
    const summary = tournament!.summary as { overview: string };
    expect(summary.overview).toBe("уже готово");
  });

  it("нет раздач карточки с разбором — summary остаётся null", async () => {
    const tournamentId = await createTournament();
    await createCardHand(tournamentId, -100, false); // без analysis

    await generateTournamentSummaryStep(makeRawTask({ tournamentId }), db);

    const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
    expect(tournament!.summary).toBeNull();
  });
});

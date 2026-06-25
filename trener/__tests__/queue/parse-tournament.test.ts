/**
 * Тесты шага PARSE_TOURNAMENT.
 *
 * Покрывают:
 *  1. Сохраняет ВСЕ размеченные раздачи турнира и метрики, переводит статус в PARSED.
 *  2. Помечает selectHandsForCard-результат флагом selected_for_card и ставит
 *     по одной задаче GENERATE_HAND_ANALYSIS на каждую отобранную раздачу.
 *  3. Идемпотентность: повторный вызов (после крэша) не дублирует ни раздачи, ни задачи.
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { ParsedHand, ParsedTournament } from "@/parser/types";
import type { RawTask } from "@/infrastructure/queue/types";
import { parseTournamentStep } from "@/infrastructure/queue/steps/parse-tournament";

const TEST_PLAYER_ID = "cccccccc-0000-0000-0000-000000000001";

const db = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

const EMPTY_SNAPSHOT = { seats: [], heroCards: [], board: [], actions: [], potTotal: 0 };

function makeHand(importanceLevel: ParsedHand["importanceLevel"], chipResult: number): ParsedHand {
  return { importanceLevel, chipResult, tableSnapshot: EMPTY_SNAPSHOT };
}

// 12 раздач: 2 CRITICAL + 6 STRONG + 4 MEDIUM → selectHandsForCard отбирает 10
// (2 критических + топ-5 сильных + топ-3 средних).
const PARSED: ParsedTournament = {
  room: "GGPoker",
  externalTournamentId: "999999",
  name: "Test MTT",
  playedAt: "2026-06-11T20:00:00.000Z",
  handsCount: 12,
  vpipPercent: 40,
  pfrPercent: 20,
  postflopAggressionFactor: 1.5,
  resultBuyins: -2,
  styleDiagnosis: "TIGHT",
  hands: [
    ...Array.from({ length: 2 }, (_, i) => makeHand("CRITICAL", -500 - i)),
    ...Array.from({ length: 6 }, (_, i) => makeHand("STRONG", 100 * (i + 1))),
    ...Array.from({ length: 4 }, (_, i) => makeHand("MEDIUM", -10 * (i + 1))),
  ],
};

function makeRawTask(payload: Record<string, unknown>): RawTask {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    type: "PARSE_TOURNAMENT",
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

async function createTournament(): Promise<string> {
  const tournament = await db.tournament.create({
    data: { playerId: TEST_PLAYER_ID, playedAt: new Date(), status: "UPLOADED" },
  });
  return tournament.id;
}

beforeAll(async () => {
  await db.player.upsert({
    where: { id: TEST_PLAYER_ID },
    update: {},
    create: { id: TEST_PLAYER_ID, email: "test-parse-tournament@trener.local" },
  });
});

beforeEach(async () => {
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await db.task.deleteMany({ where: { type: "GENERATE_HAND_ANALYSIS" } });
});

afterAll(async () => {
  await db.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await db.task.deleteMany({ where: { type: "GENERATE_HAND_ANALYSIS" } });
  await db.player.delete({ where: { id: TEST_PLAYER_ID } }).catch(() => {});
  await db.$disconnect();
});

describe("PARSE_TOURNAMENT — основной путь", () => {
  it("сохраняет все 12 раздач, метрики, и переводит турнир в PARSED", async () => {
    const tournamentId = await createTournament();

    await parseTournamentStep(makeRawTask({ tournamentId, parsed: PARSED }), db);

    const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
    expect(tournament!.status).toBe("PARSED");
    expect(tournament!.handsCount).toBe(12);
    expect(tournament!.vpipPercent?.toNumber()).toBe(40);
    expect(tournament!.resultBuyins?.toNumber()).toBe(-2);
    expect(tournament!.styleDiagnosis).toBe("TIGHT");

    const hands = await db.hand.findMany({ where: { tournamentId } });
    expect(hands).toHaveLength(12);
  });

  it("отмечает selectHandsForCard-результат (10 из 12) и ставит по задаче на каждую", async () => {
    const tournamentId = await createTournament();

    await parseTournamentStep(makeRawTask({ tournamentId, parsed: PARSED }), db);

    const hands = await db.hand.findMany({ where: { tournamentId } });
    const selected = hands.filter((h) => h.selectedForCard);
    expect(selected).toHaveLength(10);
    expect(selected.filter((h) => h.importanceLevel === "CRITICAL")).toHaveLength(2);
    expect(selected.filter((h) => h.importanceLevel === "STRONG")).toHaveLength(5);
    expect(selected.filter((h) => h.importanceLevel === "MEDIUM")).toHaveLength(3);

    const tasks = await db.task.findMany({ where: { type: "GENERATE_HAND_ANALYSIS" } });
    expect(tasks).toHaveLength(10);
    expect(new Set(tasks.map((t) => (t.payload as { handId: string }).handId))).toEqual(
      new Set(selected.map((h) => h.id))
    );
  });

  it("идемпотентность: повторный вызов не дублирует раздачи и задачи", async () => {
    const tournamentId = await createTournament();

    await parseTournamentStep(makeRawTask({ tournamentId, parsed: PARSED }), db);
    await parseTournamentStep(makeRawTask({ tournamentId, parsed: PARSED }), db); // повтор после "крэша"

    const hands = await db.hand.findMany({ where: { tournamentId } });
    expect(hands).toHaveLength(12);

    const tasks = await db.task.findMany({ where: { type: "GENERATE_HAND_ANALYSIS" } });
    expect(tasks).toHaveLength(10);
  });
});

// Модель «грузи сколько угодно, разбор — у одного бесплатного, остальные под замком».
// При включённом гейте: первый турнир бесплатен (разбор открыт), второй без подписки
// запирается — метрики сохранены, но НИ ОДНОЙ платной ИИ-задачи (правило №1).
describe("PARSE_TOURNAMENT — гейт разбора (правило №1)", () => {
  beforeEach(() => {
    process.env.SUBSCRIPTION_GATE_ENABLED = "true";
  });
  afterEach(() => {
    delete process.env.SUBSCRIPTION_GATE_ENABLED;
  });

  it("первый (бесплатный) турнир: разбор открыт, задачи поставлены", async () => {
    const tournamentId = await createTournament();

    await parseTournamentStep(makeRawTask({ tournamentId, parsed: PARSED }), db);

    const t = await db.tournament.findUnique({ where: { id: tournamentId } });
    expect(t!.analysisUnlocked).toBe(true);

    const tasks = await db.task.findMany({ where: { type: "GENERATE_HAND_ANALYSIS" } });
    expect(tasks).toHaveLength(10);
  });

  it("второй турнир без подписки: заперт — метрики есть, платных задач НЕТ", async () => {
    // Первый (бесплатный) уже существует и заведомо старше — он и есть бесплатный.
    await db.tournament.create({
      data: {
        playerId: TEST_PLAYER_ID,
        playedAt: new Date(),
        status: "PARSED",
        createdAt: new Date(Date.now() - 100_000),
      },
    });
    const tournamentId = await createTournament(); // второй, новее

    await parseTournamentStep(makeRawTask({ tournamentId, parsed: PARSED }), db);

    const t = await db.tournament.findUnique({ where: { id: tournamentId } });
    expect(t!.status).toBe("PARSED");
    expect(t!.analysisUnlocked).toBe(false);

    // Метрики и раздачи сохранены (видны бесплатно)...
    const hands = await db.hand.findMany({ where: { tournamentId } });
    expect(hands).toHaveLength(12);

    // ...но ни одной платной ИИ-задачи не порождено.
    const tasks = await db.task.findMany({ where: { type: "GENERATE_HAND_ANALYSIS" } });
    expect(tasks).toHaveLength(0);
  });
});

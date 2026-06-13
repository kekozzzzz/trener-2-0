/**
 * Тесты шага GENERATE_HAND_ANALYSIS.
 *
 * Покрывают:
 *  1. Сохраняет analysis для отмеченной раздачи (fake-адаптер, без сети и расходов).
 *  2. CRITICAL-раздача — создаёт Dialogue с вопросом, вердикт скрыт до ответа (правило 2).
 *  3. CARD_READY выставляется только когда обработаны ВСЕ отобранные раздачи.
 *  4. Раздачи вне карточки (selected_for_card = false) не блокируют CARD_READY.
 *  5. POISONED-раздача не блокирует CARD_READY для остальных.
 *  6. Идемпотентность: повторный вызов с уже сохранённым analysis не дублирует Dialogue.
 *  7. Без посчитанных метрик турнира — задача уходит в retry с понятной ошибкой.
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import type { HandImportance, PlayerStyle } from "@/parser/types";
import type { RawTask } from "@/infrastructure/queue/types";
import { enqueue, runWorkerOnce } from "@/infrastructure/queue";
import { generateHandAnalysisStep } from "@/infrastructure/queue/steps/generate-hand-analysis";

const TEST_PLAYER_ID = "bbbbbbbb-0000-0000-0000-000000000001";

const db = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

const EMPTY_SNAPSHOT = { seats: [], heroCards: [], board: [], actions: [], potTotal: 0 };

type TournamentOverrides = {
  status?: "UPLOADED" | "PARSED";
  handsCount?: number | null;
  vpipPercent?: number | null;
  resultBuyins?: number | null;
  styleDiagnosis?: PlayerStyle | null;
};

async function createTournament(overrides: TournamentOverrides = {}): Promise<string> {
  const data = {
    status: "PARSED" as const,
    handsCount: 6,
    vpipPercent: 50,
    resultBuyins: -1,
    styleDiagnosis: "LOOSE" as const,
    ...overrides,
  };

  const tournament = await db.tournament.create({
    data: { playerId: TEST_PLAYER_ID, playedAt: new Date(), ...data },
  });
  return tournament.id;
}

async function createHand(tournamentId: string, importanceLevel: HandImportance, selectedForCard: boolean): Promise<string> {
  const hand = await db.hand.create({
    data: {
      tournamentId,
      importanceLevel,
      chipResult: -100,
      tableData: EMPTY_SNAPSHOT as unknown as Prisma.InputJsonValue,
      selectedForCard,
    },
  });
  return hand.id;
}

function makeRawTask(payload: Record<string, unknown>): RawTask {
  return {
    id: "00000000-0000-0000-0000-000000000000",
    type: "GENERATE_HAND_ANALYSIS",
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
    create: { id: TEST_PLAYER_ID, email: "test-generate-hand-analysis@trener.local" },
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

describe("GENERATE_HAND_ANALYSIS — основной путь", () => {
  it("сохраняет analysis для STRONG-раздачи и переводит турнир в CARD_READY", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId, "STRONG", true);
    await enqueue(db, { type: "GENERATE_HAND_ANALYSIS", payload: { handId } });

    const result = await runWorkerOnce(db);
    expect(result.tasksProcessed).toBe(1);

    const hand = await db.hand.findUnique({ where: { id: handId } });
    const analysis = hand!.analysis as { played?: string; optimal?: string; note?: string };
    expect(analysis.played).toBeTruthy();
    expect(analysis.optimal).toBeTruthy();
    expect(analysis.note).toBeTruthy();

    const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
    expect(tournament!.status).toBe("CARD_READY");
  });

  it("CRITICAL-раздача создаёт Dialogue с вопросом, вердикт скрыт до ответа игрока", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId, "CRITICAL", true);
    await enqueue(db, { type: "GENERATE_HAND_ANALYSIS", payload: { handId } });

    await runWorkerOnce(db);

    const dialogue = await db.dialogue.findUnique({
      where: { handId },
      include: { rounds: true },
    });
    expect(dialogue).not.toBeNull();
    expect(dialogue!.state).toBe("QUESTION_ASKED");
    expect(dialogue!.verdict).toBeNull();
    expect(dialogue!.rounds).toHaveLength(1);
    expect(dialogue!.rounds[0].roundNumber).toBe(1);
    expect(dialogue!.rounds[0].question).toBeTruthy();
    expect(dialogue!.rounds[0].answer).toBeNull();

    const hand = await db.hand.findUnique({ where: { id: handId } });
    const analysis = hand!.analysis as { draftVerdict?: string };
    expect(analysis.draftVerdict).toBeTruthy();
  });

  it("CARD_READY выставляется только после обработки всех отобранных раздач", async () => {
    const tournamentId = await createTournament({ handsCount: 2 });
    const hand1 = await createHand(tournamentId, "MEDIUM", true);
    const hand2 = await createHand(tournamentId, "MEDIUM", true);
    await enqueue(db, { type: "GENERATE_HAND_ANALYSIS", payload: { handId: hand1 } });
    await enqueue(db, { type: "GENERATE_HAND_ANALYSIS", payload: { handId: hand2 } });

    await runWorkerOnce(db);
    expect((await db.tournament.findUnique({ where: { id: tournamentId } }))!.status).toBe("PARSED");

    await runWorkerOnce(db);
    expect((await db.tournament.findUnique({ where: { id: tournamentId } }))!.status).toBe("CARD_READY");
  });

  it("раздачи вне карточки (selected_for_card = false) не блокируют CARD_READY", async () => {
    const tournamentId = await createTournament({ handsCount: 2 });
    const selected = await createHand(tournamentId, "MEDIUM", true);
    await createHand(tournamentId, "MEDIUM", false);
    await enqueue(db, { type: "GENERATE_HAND_ANALYSIS", payload: { handId: selected } });

    await runWorkerOnce(db);

    const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
    expect(tournament!.status).toBe("CARD_READY");
  });

  it("POISONED-раздача не блокирует CARD_READY для остальных", async () => {
    const tournamentId = await createTournament({ handsCount: 2 });
    const ok = await createHand(tournamentId, "MEDIUM", true);
    const broken = await createHand(tournamentId, "MEDIUM", true);

    await enqueue(db, { type: "GENERATE_HAND_ANALYSIS", payload: { handId: ok } });
    const brokenTaskId = await enqueue(db, { type: "GENERATE_HAND_ANALYSIS", payload: { handId: broken } });
    await db.task.update({ where: { id: brokenTaskId }, data: { status: "POISONED", attempt: 3 } });

    await runWorkerOnce(db); // в очереди PENDING остался только handId === ok

    const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
    expect(tournament!.status).toBe("CARD_READY");

    const brokenHand = await db.hand.findUnique({ where: { id: broken } });
    expect(brokenHand!.analysis).toBeNull();
  });

  it("повторный вызов после сохранённого analysis не дублирует Dialogue", async () => {
    const tournamentId = await createTournament();
    const handId = await createHand(tournamentId, "CRITICAL", true);

    const task = makeRawTask({ handId });
    await generateHandAnalysisStep(task, db);
    await generateHandAnalysisStep(task, db); // повтор — analysis уже сохранён, LLM повторно не зовётся

    const dialogues = await db.dialogue.findMany({ where: { handId } });
    expect(dialogues).toHaveLength(1);

    const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
    expect(tournament!.status).toBe("CARD_READY");
  });

  it("без посчитанных метрик турнира бросает понятную ошибку (PARSE_TOURNAMENT должен идти раньше)", async () => {
    const tournamentId = await createTournament({
      status: "UPLOADED",
      handsCount: null,
      vpipPercent: null,
      resultBuyins: null,
      styleDiagnosis: null,
    });
    const handId = await createHand(tournamentId, "MEDIUM", true);
    await enqueue(db, { type: "GENERATE_HAND_ANALYSIS", payload: { handId } });

    await runWorkerOnce(db);

    const [task] = await db.task.findMany({ where: { type: "GENERATE_HAND_ANALYSIS" } });
    expect(task.status).toBe("PENDING");
    expect(task.error).toMatch(/Метрики турнира не посчитаны/);
  });
});

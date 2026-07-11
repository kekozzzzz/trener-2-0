/**
 * Тесты listMyTournaments / recentTournaments (features/tournaments/queries.ts,
 * [[2026-06-15-личный-кабинет]]).
 *
 * Покрывают:
 *  1. Нет турниров → пустой массив.
 *  2. Возвращает только турниры этого игрока (чужой не попадает) — защита от IDOR.
 *  3. Исключает удалённые (deletedAt) — запрет 5.
 *  4. Порядок по playedAt desc (свежие сверху).
 *  5. Decimal приводится к number, NULL пробрасывается как null.
 *  6. recentTournaments ограничивает количество.
 *  7. reviewProgress: null пока не открыл ни одной раздачи; done/total когда начал;
 *     null снова когда турнир пройден целиком (fullyReviewed).
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";
import { listMyTournaments, recentTournaments } from "@/features/tournaments/queries";

const PLAYER_ID = "11111111-0000-0000-0000-000000000003";
const OTHER_PLAYER_ID = "11111111-0000-0000-0000-000000000004";

const db = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

type TournamentSeed = {
  playerId?: string;
  playedAt: Date;
  status?: "UPLOADED" | "PARSING" | "PARSED" | "CARD_READY" | "FAILED";
  vpipPercent?: number | null;
  handsCount?: number | null;
  resultBuyins?: number | null;
  styleDiagnosis?: "LOOSE" | "TIGHT" | "PASSIVE" | "AGGRESSIVE" | null;
  deletedAt?: Date | null;
};

async function createTournament(seed: TournamentSeed): Promise<string> {
  const t = await db.tournament.create({
    data: {
      playerId: seed.playerId ?? PLAYER_ID,
      playedAt: seed.playedAt,
      status: seed.status ?? "CARD_READY",
      vpipPercent: seed.vpipPercent ?? null,
      handsCount: seed.handsCount ?? null,
      resultBuyins: seed.resultBuyins ?? null,
      styleDiagnosis: seed.styleDiagnosis ?? null,
      deletedAt: seed.deletedAt ?? null,
    },
  });
  return t.id;
}

// Карточная раздача для проверки reviewProgress: опционально просмотренная и/или
// с сократовским диалогом в заданном состоянии.
async function createCardHand(
  tournamentId: string,
  opts: { viewed?: boolean; dialogueState?: "QUESTION_ASKED" | "ANSWER_RECEIVED" | "VERDICT_SHOWN" } = {},
): Promise<void> {
  await db.hand.create({
    data: {
      tournamentId,
      importanceLevel: "CRITICAL",
      chipResult: -100,
      tableData: { seats: [], actions: [] } as unknown as Prisma.InputJsonValue,
      selectedForCard: true,
      viewedAt: opts.viewed ? new Date() : null,
      ...(opts.dialogueState
        ? {
            dialogue: {
              create: {
                state: opts.dialogueState,
                verdict: opts.dialogueState === "VERDICT_SHOWN" ? "Решение разумное." : null,
                rounds: { create: { roundNumber: 1, question: "Почему так сыграл?" } },
              },
            },
          }
        : {}),
    },
  });
}

beforeAll(async () => {
  await db.player.upsert({
    where: { id: PLAYER_ID },
    update: {},
    create: { id: PLAYER_ID, email: "test-list-tournaments@trener.local" },
  });
  await db.player.upsert({
    where: { id: OTHER_PLAYER_ID },
    update: {},
    create: { id: OTHER_PLAYER_ID, email: "test-list-other@trener.local" },
  });
});

beforeEach(async () => {
  await db.tournament.deleteMany({ where: { playerId: { in: [PLAYER_ID, OTHER_PLAYER_ID] } } });
});

afterAll(async () => {
  await db.tournament.deleteMany({ where: { playerId: { in: [PLAYER_ID, OTHER_PLAYER_ID] } } });
  await db.player.delete({ where: { id: PLAYER_ID } }).catch(() => {});
  await db.player.delete({ where: { id: OTHER_PLAYER_ID } }).catch(() => {});
  await db.$disconnect();
  await prisma.$disconnect();
});

describe("listMyTournaments", () => {
  it("нет турниров → пустой массив", async () => {
    const result = await listMyTournaments(PLAYER_ID);
    expect(result).toEqual([]);
  });

  it("возвращает только турниры этого игрока (чужой не попадает)", async () => {
    const mine = await createTournament({ playedAt: new Date("2026-06-10") });
    await createTournament({ playerId: OTHER_PLAYER_ID, playedAt: new Date("2026-06-11") });

    const result = await listMyTournaments(PLAYER_ID);

    expect(result.map((t) => t.id)).toEqual([mine]);
  });

  it("исключает удалённые (deletedAt)", async () => {
    const alive = await createTournament({ playedAt: new Date("2026-06-10") });
    await createTournament({ playedAt: new Date("2026-06-11"), deletedAt: new Date() });

    const result = await listMyTournaments(PLAYER_ID);

    expect(result.map((t) => t.id)).toEqual([alive]);
  });

  it("порядок по playedAt desc (свежие сверху)", async () => {
    const older = await createTournament({ playedAt: new Date("2026-06-01") });
    const newer = await createTournament({ playedAt: new Date("2026-06-15") });
    const middle = await createTournament({ playedAt: new Date("2026-06-08") });

    const result = await listMyTournaments(PLAYER_ID);

    expect(result.map((t) => t.id)).toEqual([newer, middle, older]);
  });

  it("Decimal приводится к number, NULL пробрасывается как null", async () => {
    await createTournament({
      playedAt: new Date("2026-06-10"),
      vpipPercent: 23.5,
      resultBuyins: -1.75,
      handsCount: 120,
      styleDiagnosis: "TIGHT",
    });
    await createTournament({ playedAt: new Date("2026-06-09"), status: "PARSING" });

    const result = await listMyTournaments(PLAYER_ID);

    const filled = result[0];
    expect(filled.vpipPercent).toBe(23.5);
    expect(filled.resultBuyins).toBe(-1.75);
    expect(filled.handsCount).toBe(120);
    expect(filled.styleDiagnosis).toBe("TIGHT");

    const empty = result[1];
    expect(empty.vpipPercent).toBeNull();
    expect(empty.resultBuyins).toBeNull();
    expect(empty.handsCount).toBeNull();
    expect(empty.styleDiagnosis).toBeNull();
  });
});

describe("reviewProgress (бейдж «В разборе»)", () => {
  it("null, пока игрок не открыл ни одной карточной раздачи", async () => {
    const id = await createTournament({ playedAt: new Date("2026-06-10") });
    await createCardHand(id, { dialogueState: "QUESTION_ASKED" });
    await createCardHand(id, { dialogueState: "QUESTION_ASKED" });

    const [row] = await listMyTournaments(PLAYER_ID);

    expect(row.id).toBe(id);
    expect(row.reviewProgress).toBeNull();
    expect(row.fullyReviewed).toBe(false);
  });

  it("начат: открыл раздачу, один вердикт из двух → done 1 / total 2", async () => {
    const id = await createTournament({ playedAt: new Date("2026-06-10") });
    await createCardHand(id, { viewed: true, dialogueState: "VERDICT_SHOWN" });
    await createCardHand(id, { dialogueState: "QUESTION_ASKED" });

    const [row] = await listMyTournaments(PLAYER_ID);

    expect(row.reviewProgress).toEqual({ done: 1, total: 2 });
    expect(row.fullyReviewed).toBe(false);
  });

  it("пройден целиком: все вердикты показаны → fullyReviewed, reviewProgress null", async () => {
    const id = await createTournament({ playedAt: new Date("2026-06-10") });
    await createCardHand(id, { viewed: true, dialogueState: "VERDICT_SHOWN" });
    await createCardHand(id, { viewed: true, dialogueState: "VERDICT_SHOWN" });

    const [row] = await listMyTournaments(PLAYER_ID);

    expect(row.fullyReviewed).toBe(true);
    expect(row.reviewProgress).toBeNull();
  });

  it("турнир без диалогов: прогресс по просмотру простых карточных", async () => {
    const id = await createTournament({ playedAt: new Date("2026-06-10") });
    await createCardHand(id, { viewed: true });
    await createCardHand(id, {});

    const [row] = await listMyTournaments(PLAYER_ID);

    expect(row.reviewProgress).toEqual({ done: 1, total: 2 });
  });
});

describe("recentTournaments", () => {
  it("ограничивает количество и сохраняет порядок", async () => {
    for (let day = 1; day <= 7; day++) {
      await createTournament({ playedAt: new Date(`2026-06-0${day}`) });
    }

    const result = await recentTournaments(PLAYER_ID, 3);

    expect(result).toHaveLength(3);
    expect(result[0].playedAt.getTime()).toBeGreaterThan(result[2].playedAt.getTime());
  });
});

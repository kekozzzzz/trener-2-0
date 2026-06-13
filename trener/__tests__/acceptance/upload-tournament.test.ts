/**
 * Приёмочный тест вертикального среза.
 * Сценарий:
 *   1. uploadTournament сохраняет турнир в статусе UPLOADED и ставит задачу в очередь.
 *   2. runWorkerOnce обрабатывает задачу PARSE_TOURNAMENT — турнир переходит в PARSED с метриками.
 *
 * Бьёт в реальную тестовую базу (trener_test).
 * beforeEach чистит tournaments и tasks тестового игрока.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { uploadTournament } from "@/features/tournaments/actions";
import { runWorkerOnce } from "@/infrastructure/queue";

const TEST_PLAYER_ID = "aaaaaaaa-0000-0000-0000-000000000001";

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

const fixtureBuffer = fs.readFileSync(
  path.join(__dirname, "../fixtures/sample_mtt.txt")
);

const richBuffer = fs.readFileSync(
  path.join(__dirname, "../fixtures/ggpoker_mtt_rich.txt")
);

beforeAll(async () => {
  await prisma.player.upsert({
    where: { id: TEST_PLAYER_ID },
    update: {},
    create: { id: TEST_PLAYER_ID, email: "test@trener.local" },
  });
});

beforeEach(async () => {
  await prisma.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await prisma.task.deleteMany({ where: { type: { in: ["PARSE_TOURNAMENT", "GENERATE_HAND_ANALYSIS"] } } });
});

afterAll(async () => {
  await prisma.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await prisma.task.deleteMany({ where: { type: { in: ["PARSE_TOURNAMENT", "GENERATE_HAND_ANALYSIS"] } } });
  await prisma.player.delete({ where: { id: TEST_PLAYER_ID } }).catch(() => {});
  await prisma.$disconnect();
});

describe("uploadTournament — главный путь", () => {
  it("создаёт турнир UPLOADED, воркер переводит в PARSED с тремя метриками", async () => {
    const result = await uploadTournament({
      fileBuffer: fixtureBuffer,
      originalFilename: "sample_mtt.txt",
      playerId: TEST_PLAYER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // После загрузки — UPLOADED, метрик ещё нет
    const before = await prisma.tournament.findUnique({ where: { id: result.tournamentId } });
    expect(before!.status).toBe("UPLOADED");
    expect(before!.handsCount).toBeNull();

    // Воркер обрабатывает задачу PARSE_TOURNAMENT
    const { tasksProcessed } = await runWorkerOnce(prisma);
    expect(tasksProcessed).toBe(1);

    // Теперь PARSED с тремя метриками
    const after = await prisma.tournament.findUnique({ where: { id: result.tournamentId } });
    expect(after!.status).toBe("PARSED");
    expect(after!.handsCount).toBeGreaterThan(0);
    expect(after!.vpipPercent).not.toBeNull();
    expect(after!.resultBuyins).not.toBeNull();
  });

  it("считает ровно 3 раздачи для трёхручного файла", async () => {
    const result = await uploadTournament({
      fileBuffer: fixtureBuffer,
      originalFilename: "sample_mtt.txt",
      playerId: TEST_PLAYER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await runWorkerOnce(prisma);

    const tournament = await prisma.tournament.findUnique({ where: { id: result.tournamentId } });
    expect(tournament!.handsCount).toBe(3);
  });

  it("возвращает ошибку для неподдерживаемого формата", async () => {
    const badBuffer = Buffer.from("PokerStars Hand #12345: Hold'em No Limit");

    const result = await uploadTournament({
      fileBuffer: badBuffer,
      originalFilename: "pokerstars.txt",
      playerId: TEST_PLAYER_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("UNSUPPORTED_FORMAT");
  });
});

describe("карточка после полного цикла — PARSE_TOURNAMENT → GENERATE_HAND_ANALYSIS → CARD_READY", () => {
  it("сохраняет все размеченные раздачи, отмечает карточку и переводит турнир в CARD_READY", async () => {
    const result = await uploadTournament({
      fileBuffer: richBuffer,
      originalFilename: "ggpoker_mtt_rich.txt",
      playerId: TEST_PLAYER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Гоняем воркер, пока очередь не опустеет: PARSE_TOURNAMENT + 6x GENERATE_HAND_ANALYSIS
    for (let i = 0; i < 10; i++) {
      const { tasksProcessed } = await runWorkerOnce(prisma);
      if (tasksProcessed === 0) break;
    }

    const tournament = await prisma.tournament.findUnique({ where: { id: result.tournamentId } });
    expect(tournament!.status).toBe("CARD_READY");
    expect(tournament!.handsCount).toBe(6);

    const hands = await prisma.hand.findMany({ where: { tournamentId: result.tournamentId } });
    expect(hands).toHaveLength(6);
    expect(hands.every((h) => h.selectedForCard)).toBe(true);
    expect(hands.every((h) => h.analysis !== null)).toBe(true);

    // 2 раздачи CRITICAL в фикстуре ggpoker_mtt_rich.txt — каждой соответствует Dialogue
    const dialogues = await prisma.dialogue.findMany({
      where: { hand: { tournamentId: result.tournamentId } },
    });
    expect(dialogues).toHaveLength(2);
    expect(dialogues.every((d) => d.state === "QUESTION_ASKED")).toBe(true);
    expect(dialogues.every((d) => d.verdict === null)).toBe(true);
  });
});

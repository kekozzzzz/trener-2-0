/**
 * Приёмочный тест вертикального среза.
 * Сценарий: вызываем uploadTournament с буфером GGPoker MTT-файла →
 * в БД появляется одна строка Tournament со статусом PARSED и тремя метриками.
 *
 * Бьёт в реальную тестовую базу (trener_test).
 * beforeEach чистит таблицу tournaments и создаёт тестового игрока.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { uploadTournament } from "@/features/tournaments/actions";

const TEST_PLAYER_ID = "aaaaaaaa-0000-0000-0000-000000000001";

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

const fixtureBuffer = fs.readFileSync(
  path.join(__dirname, "../fixtures/sample_mtt.txt")
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
});

afterAll(async () => {
  await prisma.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await prisma.player.delete({ where: { id: TEST_PLAYER_ID } }).catch(() => {});
  await prisma.$disconnect();
});

describe("uploadTournament — главный путь", () => {
  it("создаёт запись Tournament в БД со статусом PARSED и тремя метриками", async () => {
    const result = await uploadTournament({
      fileBuffer: fixtureBuffer,
      originalFilename: "sample_mtt.txt",
      playerId: TEST_PLAYER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const tournament = await prisma.tournament.findUnique({
      where: { id: result.tournamentId },
    });

    expect(tournament).not.toBeNull();
    expect(tournament!.status).toBe("PARSED");
    expect(tournament!.handsCount).toBeGreaterThan(0);
    expect(tournament!.vpipPercent).not.toBeNull();
    expect(tournament!.resultBuyins).not.toBeNull();
  });

  it("считает ровно 3 раздачи для трёхручного файла", async () => {
    const result = await uploadTournament({
      fileBuffer: fixtureBuffer,
      originalFilename: "sample_mtt.txt",
      playerId: TEST_PLAYER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const tournament = await prisma.tournament.findUnique({
      where: { id: result.tournamentId },
    });

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

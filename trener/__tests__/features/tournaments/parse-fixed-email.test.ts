/**
 * Тест подбора получателей для рассылки «починили» (план
 * 2026-08-31-алерт-об-ошибке-разбора-с-контактом-игрока, Фаза 3).
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { findRecipientsForSignature } from "@/features/tournaments/parse-fixed-email";

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

const PLAYER_A = "aaaaaaaa-0000-0000-0000-0000000000a1";
const PLAYER_B = "aaaaaaaa-0000-0000-0000-0000000000a2";
const PLAYER_CLOSED = "aaaaaaaa-0000-0000-0000-0000000000a3";
const SIGNATURE = "тестовая сигнатура рума XYZ";
const OTHER_SIGNATURE = "другая сигнатура — не должна попасть в выборку";

beforeAll(async () => {
  await prisma.player.upsert({
    where: { id: PLAYER_A },
    update: { email: "a@trener.local", locale: "ru" },
    create: { id: PLAYER_A, email: "a@trener.local", locale: "ru" },
  });
  await prisma.player.upsert({
    where: { id: PLAYER_B },
    update: { email: "b@trener.local", locale: "en" },
    create: { id: PLAYER_B, email: "b@trener.local", locale: "en" },
  });
  // Закрытый аккаунт: email анонимизирован (NULL) — не должен попасть в рассылку.
  await prisma.player.upsert({
    where: { id: PLAYER_CLOSED },
    update: { email: null, closedAt: new Date() },
    create: { id: PLAYER_CLOSED, email: null, closedAt: new Date() },
  });
});

beforeEach(async () => {
  await prisma.unrecognizedUpload.deleteMany({ where: { signature: { in: [SIGNATURE, OTHER_SIGNATURE] } } });
});

afterAll(async () => {
  await prisma.unrecognizedUpload.deleteMany({ where: { signature: { in: [SIGNATURE, OTHER_SIGNATURE] } } });
  await prisma.player.deleteMany({ where: { id: { in: [PLAYER_A, PLAYER_B, PLAYER_CLOSED] } } });
  await prisma.$disconnect();
});

describe("findRecipientsForSignature", () => {
  it("возвращает по одному получателю на игрока, даже если файлов с этой сигнатурой несколько", async () => {
    await prisma.unrecognizedUpload.createMany({
      data: [
        { playerId: PLAYER_A, signature: SIGNATURE, reason: "test", originalFilename: "a1.txt", sizeBytes: 10 },
        { playerId: PLAYER_A, signature: SIGNATURE, reason: "test", originalFilename: "a2.txt", sizeBytes: 10 },
        { playerId: PLAYER_B, signature: SIGNATURE, reason: "test", originalFilename: "b1.txt", sizeBytes: 10 },
        { playerId: PLAYER_CLOSED, signature: SIGNATURE, reason: "test", originalFilename: "c1.txt", sizeBytes: 10 },
        { playerId: null, signature: SIGNATURE, reason: "test", originalFilename: "anon.txt", sizeBytes: 10 },
        { playerId: PLAYER_A, signature: OTHER_SIGNATURE, reason: "test", originalFilename: "other.txt", sizeBytes: 10 },
      ],
    });

    const recipients = await findRecipientsForSignature(SIGNATURE);

    expect(recipients).toHaveLength(2);
    expect(recipients).toEqual(
      expect.arrayContaining([
        { email: "a@trener.local", locale: "ru" },
        { email: "b@trener.local", locale: "en" },
      ]),
    );
    // Закрытый аккаунт (email NULL) и анонимная запись (playerId NULL) — не попали.
    expect(recipients.some((r) => r.email === null)).toBe(false);
  });

  it("сигнатура без загрузок → пустой список", async () => {
    const recipients = await findRecipientsForSignature("несуществующая сигнатура");
    expect(recipients).toEqual([]);
  });
});

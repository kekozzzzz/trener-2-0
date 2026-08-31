/**
 * Тест: Telegram-алерт при аномалии разбора несёт email игрока и mailto-ссылку —
 * чтобы Артём мог сразу написать лично, не заходя в базу (план
 * 2026-08-31-алерт-об-ошибке-разбора-с-контактом-игрока).
 *
 * Адаптер уведомлений замокан — сеть/бот не трогаем. Бьёт в реальную тестовую базу
 * (trener_test), т.к. alertAdmin ищет email игрока через shared prisma-клиент.
 */

import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

vi.mock("@/infrastructure/adapters/notify", () => ({
  safeNotifyAdmin: vi.fn().mockResolvedValue(undefined),
}));

import { uploadTournament } from "@/features/tournaments/actions";
import { safeNotifyAdmin } from "@/infrastructure/adapters/notify";

const TEST_PLAYER_ID = "aaaaaaaa-0000-0000-0000-0000000000aa";
const TEST_EMAIL = "alert-test@trener.local";

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

beforeAll(async () => {
  await prisma.player.upsert({
    where: { id: TEST_PLAYER_ID },
    update: { email: TEST_EMAIL },
    create: { id: TEST_PLAYER_ID, email: TEST_EMAIL },
  });
});

beforeEach(async () => {
  vi.clearAllMocks();
  await prisma.unrecognizedUpload.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
});

afterAll(async () => {
  await prisma.unrecognizedUpload.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await prisma.player.delete({ where: { id: TEST_PLAYER_ID } }).catch(() => {});
  await prisma.$disconnect();
});

describe("alertAdmin — email игрока в тексте алерта", () => {
  it("незнакомый формат → алерт содержит email игрока и mailto-ссылку", async () => {
    // Уникальная сигнатура (timestamp в заголовке) — не попадает под троттлинг
    // другого прогона этого же теста.
    const badBuffer = Buffer.from(`Неизвестный рум заголовок ${Date.now()}`);

    const result = await uploadTournament({
      fileBuffer: badBuffer,
      originalFilename: "unknown.txt",
      playerId: TEST_PLAYER_ID,
    });

    expect(result.ok).toBe(false);
    expect(safeNotifyAdmin).toHaveBeenCalledTimes(1);
    const message = vi.mocked(safeNotifyAdmin).mock.calls[0][0];
    expect(message).toContain(TEST_EMAIL);
    expect(message).toContain(`mailto:${TEST_EMAIL}`);
  });

  it("нет playerId с email в базе → алерт уходит без строки про игрока, не падает", async () => {
    const unknownPlayerId = "aaaaaaaa-0000-0000-0000-0000000000ff"; // не создан в БД
    const badBuffer = Buffer.from(`Ещё один незнакомый рум ${Date.now()}`);

    const result = await uploadTournament({
      fileBuffer: badBuffer,
      originalFilename: "unknown2.txt",
      playerId: unknownPlayerId,
    });

    expect(result.ok).toBe(false);
    expect(safeNotifyAdmin).toHaveBeenCalledTimes(1);
    const message = vi.mocked(safeNotifyAdmin).mock.calls[0][0];
    expect(message).not.toContain("Игрок:");
  });
});

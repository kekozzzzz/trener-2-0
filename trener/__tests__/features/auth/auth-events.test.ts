/**
 * Тесты recordAuthEvent (features/auth/auth-events.ts) — журнал событий входа.
 *
 * 1. Пишет строку журнала; вне HTTP-контекста IP неизвестен → country NULL.
 * 2. Ошибка БД (несуществующий playerId → нарушение FK) глушится: вход из-за
 *    журнала сломаться не может, promise разрешается без исключения.
 *
 * Бьёт в реальную тестовую базу (trener_test), как остальные auth-тесты.
 */

import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import { recordAuthEvent } from "@/features/auth/auth-events";

const createdIds: string[] = [];

afterAll(async () => {
  if (createdIds.length > 0) {
    await prisma.authEvent.deleteMany({ where: { id: { in: createdIds } } });
  }
  await prisma.$disconnect();
});

describe("recordAuthEvent", () => {
  it("пишет событие; вне HTTP-контекста страна NULL", async () => {
    const before = new Date(Date.now() - 1000);
    await recordAuthEvent("LOGIN_FAILED", null);

    const row = await prisma.authEvent.findFirst({
      where: { kind: "LOGIN_FAILED", createdAt: { gte: before } },
      orderBy: { createdAt: "desc" },
    });
    expect(row).not.toBeNull();
    createdIds.push(row!.id);
    expect(row!.playerId).toBeNull();
    expect(row!.country).toBeNull();
  });

  it("ошибка БД глушится: несуществующий playerId (FK) не бросает наружу", async () => {
    const ghost = "00000000-0000-0000-0000-00000000dead";
    await expect(recordAuthEvent("LOGIN_PASSWORD", ghost)).resolves.toBeUndefined();
    // Строка при этом не создана — упавший INSERT не оставил следа.
    expect(await prisma.authEvent.count({ where: { playerId: ghost } })).toBe(0);
  });
});

/**
 * Тесты тревоги сторожа из воркера (infrastructure/queue/worker.ts).
 *
 * Покрывают:
 *  1. Задача ушла в POISONED → safeNotifyAdmin вызван один раз, в сообщении тип задачи.
 *  2. Успешная задача (DONE) → safeNotifyAdmin не вызывается.
 *
 * Адаптер уведомлений замокан — сеть/бот не трогаем, проверяем только врезку в воркер.
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

// Мок модуля уведомлений: worker.ts импортирует safeNotifyAdmin отсюда.
vi.mock("@/infrastructure/adapters/notify", () => ({
  safeNotifyAdmin: vi.fn().mockResolvedValue(undefined),
}));

import { enqueue, runWorkerOnce, registerStep } from "@/infrastructure/queue";
import { safeNotifyAdmin } from "@/infrastructure/adapters/notify";

const db = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

beforeEach(async () => {
  await db.task.deleteMany();
  vi.clearAllMocks();
});

afterAll(async () => {
  await db.task.deleteMany();
  await db.$disconnect();
});

describe("тревога при карантине", () => {
  it("POISONED → safeNotifyAdmin вызван один раз с типом задачи", async () => {
    registerStep("NOTIFY_POISON_FAIL", async () => {
      throw new Error("always fails");
    });

    await enqueue(db, { type: "NOTIFY_POISON_FAIL", payload: {} });

    // Три прогона до карантина (как в worker.test.ts): после каждой неудачи
    // сбрасываем run_after, чтобы воркер взял задачу снова.
    for (let i = 0; i < 3; i++) {
      await db.task.updateMany({
        where: { type: "NOTIFY_POISON_FAIL", status: "PENDING" },
        data: { runAfter: new Date(Date.now() - 1000) },
      });
      await runWorkerOnce(db);
    }

    const [task] = await db.task.findMany({ where: { type: "NOTIFY_POISON_FAIL" } });
    expect(task.status).toBe("POISONED");

    // Тревога — только на финальном (poison) прогоне, ровно один раз.
    expect(safeNotifyAdmin).toHaveBeenCalledTimes(1);
    const message = vi.mocked(safeNotifyAdmin).mock.calls[0][0];
    expect(message).toContain("NOTIFY_POISON_FAIL");
    expect(message).toContain("карантин");
  });

  it("успешная задача (DONE) → тревога не шлётся", async () => {
    await enqueue(db, { type: "NOOP", payload: {} });

    await runWorkerOnce(db);

    const [task] = await db.task.findMany({ where: { type: "NOOP" } });
    expect(task.status).toBe("DONE");
    expect(safeNotifyAdmin).not.toHaveBeenCalled();
  });
});

/**
 * Тест идемпотентности очереди.
 *
 * Правило: одна задача обрабатывается РОВНО один раз, даже если воркер
 * запускается несколько раз подряд. Второй запуск не находит PENDING-задач
 * и возвращает { tasksProcessed: 0 }.
 *
 * До постройки infrastructure/queue/ этот тест КРАСНЫЙ:
 *   - нет таблицы tasks в схеме
 *   - нет enqueue / runWorkerOnce
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { enqueue, runWorkerOnce } from "@/infrastructure/queue";

const db = new PrismaClient({
  datasources: {
    db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" },
  },
});

beforeEach(async () => {
  await db.task.deleteMany();
});

afterAll(async () => {
  await db.task.deleteMany();
  await db.$disconnect();
});

describe("идемпотентность: одна задача — один результат", () => {
  it("два последовательных запуска воркера не создают дублей", async () => {
    await enqueue(db, { type: "NOOP", payload: {} });

    const run1 = await runWorkerOnce(db);
    const run2 = await runWorkerOnce(db);

    // первый прогон забрал задачу
    expect(run1.tasksProcessed).toBe(1);
    // второй прогон не нашёл ничего pending
    expect(run2.tasksProcessed).toBe(0);

    const tasks = await db.task.findMany({ where: { type: "NOOP" } });
    // в БД ровно одна запись, и она в DONE
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe("DONE");
    expect(tasks[0].doneAt).not.toBeNull();
  });
});

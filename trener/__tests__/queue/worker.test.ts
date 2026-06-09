/**
 * Тесты механики очереди и воркера.
 *
 * Покрывают:
 *  1. NOOP-задача переходит в DONE
 *  2. Нет PENDING → возвращает { tasksProcessed: 0 }
 *  3. Задача с run_after в будущем не берётся
 *  4. Неизвестный тип → FAILED (без retry)
 *  5. Ошибка в хендлере → PENDING с задержкой (retry)
 *  6. После MAX_ATTEMPTS ошибок → POISONED (карантин)
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { enqueue, runWorkerOnce, registerStep } from "@/infrastructure/queue";

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

// ── 1. Основной путь ─────────────────────────────────────────────────────────

describe("NOOP шаг", () => {
  it("переводит задачу в DONE и ставит doneAt", async () => {
    await enqueue(db, { type: "NOOP", payload: {} });

    const result = await runWorkerOnce(db);

    expect(result.tasksProcessed).toBe(1);

    const [task] = await db.task.findMany({ where: { type: "NOOP" } });
    expect(task.status).toBe("DONE");
    expect(task.doneAt).not.toBeNull();
    expect(task.attempt).toBe(1);
  });
});

// ── 2. Нет задач ─────────────────────────────────────────────────────────────

describe("пустая очередь", () => {
  it("возвращает { tasksProcessed: 0 } когда нет PENDING", async () => {
    const result = await runWorkerOnce(db);
    expect(result.tasksProcessed).toBe(0);
  });
});

// ── 3. Отложенная задача ─────────────────────────────────────────────────────

describe("задача с run_after в будущем", () => {
  it("не берётся воркером до наступления времени", async () => {
    const id = await enqueue(db, { type: "NOOP", payload: {} });
    // сдвигаем run_after на 1 час вперёд
    await db.task.update({
      where: { id },
      data: { runAfter: new Date(Date.now() + 3_600_000) },
    });

    const result = await runWorkerOnce(db);

    expect(result.tasksProcessed).toBe(0);
    const task = await db.task.findUnique({ where: { id } });
    expect(task!.status).toBe("PENDING");
  });
});

// ── 4. Нет хендлера → FAILED ─────────────────────────────────────────────────

describe("задача неизвестного типа", () => {
  it("переводится в FAILED без retry", async () => {
    await enqueue(db, { type: "NO_SUCH_STEP", payload: {} });

    const result = await runWorkerOnce(db);

    expect(result.tasksProcessed).toBe(1);
    const [task] = await db.task.findMany({ where: { type: "NO_SUCH_STEP" } });
    expect(task.status).toBe("FAILED");
    expect(task.error).toMatch(/No handler registered/);
  });
});

// ── 5. Retry при ошибке ──────────────────────────────────────────────────────

describe("хендлер бросает ошибку", () => {
  it("переводит задачу в PENDING с задержкой (retry)", async () => {
    registerStep("FAIL_ONCE_RETRY", async () => {
      throw new Error("temporary failure");
    });

    await enqueue(db, { type: "FAIL_ONCE_RETRY", payload: {} });
    const result = await runWorkerOnce(db);

    expect(result.tasksProcessed).toBe(1);

    const [task] = await db.task.findMany({ where: { type: "FAIL_ONCE_RETRY" } });
    expect(task.status).toBe("PENDING");
    expect(task.error).toMatch(/temporary failure/);
    // run_after должна быть в будущем (задержка)
    expect(task.runAfter.getTime()).toBeGreaterThan(Date.now());
    expect(task.attempt).toBe(1);
  });
});

// ── 6. Карантин после MAX_ATTEMPTS ───────────────────────────────────────────

describe("ядовитая задача", () => {
  it("уходит в POISONED после 3 последовательных ошибок", async () => {
    registerStep("ALWAYS_FAIL_POISON", async () => {
      throw new Error("always fails");
    });

    await enqueue(db, { type: "ALWAYS_FAIL_POISON", payload: {} });

    // Три прогона: после каждой неудачи сбрасываем run_after чтобы воркер
    // мог взять задачу снова (иначе ждём задержку).
    for (let i = 0; i < 3; i++) {
      await db.task.updateMany({
        where: { type: "ALWAYS_FAIL_POISON", status: "PENDING" },
        data: { runAfter: new Date(Date.now() - 1000) },
      });
      await runWorkerOnce(db);
    }

    const [task] = await db.task.findMany({ where: { type: "ALWAYS_FAIL_POISON" } });
    expect(task.status).toBe("POISONED");
    expect(task.error).toMatch(/always fails/);
    expect(task.attempt).toBe(3);
  });
});

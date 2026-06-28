/**
 * Тесты параллельного прогона очереди (drainQueue) и мгновенного пинка (kickWorker).
 *
 * Покрывают:
 *  1. drainQueue разгребает всю очередь до конца
 *  2. drainQueue реально считает параллельно (concurrency > 1)
 *  3. kickWorker будит воркер и опустошает очередь
 *  4. kickWorker single-flight: повторный пинок во время прогона не теряет задачи
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { enqueue, drainQueue, kickWorker, registerStep } from "@/infrastructure/queue";

const db = new PrismaClient({
  datasources: {
    db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" },
  },
});

// Этот файл тестирует САМ kickWorker — включаем фоновый пинок для него (в остальных
// тестах он выключен, чтобы fire-and-forget дренаж не воровал чужие задачи). Файлы идут
// серийно (fileParallelism: false), пинок здесь дожидаемся — утечки в другие файлы нет.
beforeAll(() => {
  process.env.QUEUE_KICK_IN_TEST = "true";
});

beforeEach(async () => {
  await db.task.deleteMany();
});

afterAll(async () => {
  delete process.env.QUEUE_KICK_IN_TEST;
  await db.task.deleteMany();
  await db.$disconnect();
});

// ── 1. Полный разгреб ────────────────────────────────────────────────────────

describe("drainQueue", () => {
  it("разгребает всю очередь и возвращает число обработанных задач", async () => {
    for (let i = 0; i < 6; i++) await enqueue(db, { type: "NOOP", payload: {} });

    const total = await drainQueue(db, 3);

    expect(total).toBe(6);
    expect(await db.task.count({ where: { status: "PENDING" } })).toBe(0);
    expect(await db.task.count({ where: { type: "NOOP", status: "DONE" } })).toBe(6);
  });

  // ── 2. Реальная параллельность ─────────────────────────────────────────────

  it("обрабатывает задачи параллельно (пик активных > 1)", async () => {
    let active = 0;
    let peak = 0;
    registerStep("TRACK_CONCURRENCY", async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 50));
      active -= 1;
    });

    for (let i = 0; i < 6; i++) await enqueue(db, { type: "TRACK_CONCURRENCY", payload: {} });

    await drainQueue(db, 3);

    expect(peak).toBeGreaterThan(1);
    expect(await db.task.count({ where: { type: "TRACK_CONCURRENCY", status: "DONE" } })).toBe(6);
  });
});

// ── 3. Пинок ─────────────────────────────────────────────────────────────────

describe("kickWorker", () => {
  it("будит воркер и опустошает очередь", async () => {
    for (let i = 0; i < 4; i++) await enqueue(db, { type: "NOOP", payload: {} });

    await kickWorker(db);

    expect(await db.task.count({ where: { status: "PENDING" } })).toBe(0);
  });

  // ── 4. Single-flight + trailing ────────────────────────────────────────────

  it("single-flight: задачи, докинутые во время прогона, не теряются", async () => {
    registerStep("SLOW_NOOP", async () => {
      await new Promise((r) => setTimeout(r, 30));
    });

    for (let i = 0; i < 3; i++) await enqueue(db, { type: "SLOW_NOOP", payload: {} });

    // Стартуем прогон, НЕ дожидаясь, и докидываем задачи + пинаем ещё раз во время него.
    const first = kickWorker(db);
    for (let i = 0; i < 3; i++) await enqueue(db, { type: "SLOW_NOOP", payload: {} });
    const second = kickWorker(db);

    await Promise.all([first, second]);

    expect(await db.task.count({ where: { status: "PENDING" } })).toBe(0);
    expect(await db.task.count({ where: { type: "SLOW_NOOP", status: "DONE" } })).toBe(6);
  });
});

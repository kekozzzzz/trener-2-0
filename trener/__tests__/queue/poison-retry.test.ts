/**
 * Отложенный повтор карантинного разбора раздачи (план 2026-09-26).
 *
 * Игроку страница обещает «вернёмся к ней позже» — обещание держит requeuePoisonedAnalyses,
 * а не кнопка. Проверяем: паузу, предел заходов, сохранение причины брака для зрячего повтора
 * и то, что чужие типы задач функция не трогает.
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { requeuePoisonedAnalyses } from "@/infrastructure/queue";

const db = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

const REJECTION = "ContentRejectedError: LLM спорит с фолдом игрока, не назвав цену колла";

// updated_at ставим сырым SQL: Prisma сама бьёт его на каждом UPDATE (@updatedAt), поэтому
// «давно ушла в карантин» иначе не изобразить. AT TIME ZONE 'UTC' обязательно: в колонке время
// в UTC, а NOW() отдаёт время в зоне сессии — без приведения тест врёт на величину смещения
// (та же грабля, что учтена в claimTask).
async function poisoned(opts: { minutesAgo: number; attempt: number; type?: string }) {
  const task = await db.task.create({
    data: {
      type: opts.type ?? "GENERATE_HAND_ANALYSIS",
      payload: { handId: "h1" },
      status: "POISONED",
      attempt: opts.attempt,
      error: REJECTION,
    },
  });
  await db.$executeRawUnsafe(
    `UPDATE tasks SET updated_at = (NOW() AT TIME ZONE 'UTC') - INTERVAL '${opts.minutesAgo} minutes' WHERE id = $1::uuid`,
    task.id,
  );
  return task.id;
}

beforeEach(async () => {
  await db.task.deleteMany();
});

afterAll(async () => {
  await db.task.deleteMany();
  await db.$disconnect();
});

describe("requeuePoisonedAnalyses", () => {
  it("возвращает в очередь разбор, пролежавший в карантине дольше паузы", async () => {
    const id = await poisoned({ minutesAgo: 25, attempt: 3 });

    expect(await requeuePoisonedAnalyses(db)).toBe(1);

    const task = await db.task.findUniqueOrThrow({ where: { id } });
    expect(task.status).toBe("PENDING");
  });

  it("свежий карантин не трогает — пауза ещё не вышла", async () => {
    const id = await poisoned({ minutesAgo: 5, attempt: 3 });

    expect(await requeuePoisonedAnalyses(db)).toBe(0);
    expect((await db.task.findUniqueOrThrow({ where: { id } })).status).toBe("POISONED");
  });

  it("причину брака СОХРАНЯЕТ — на ней держится зрячий повтор", async () => {
    const id = await poisoned({ minutesAgo: 25, attempt: 3 });
    await requeuePoisonedAnalyses(db);

    const task = await db.task.findUniqueOrThrow({ where: { id } });
    expect(task.error).toBe(REJECTION);
    expect(task.attempt).toBe(3); // счётчик заходов не сбрасываем
  });

  it("исчерпав заходы, больше не возвращает — бесконечной траты нет", async () => {
    // 3 обычные попытки + 2 отложенных захода = 5, дальше стоп.
    const id = await poisoned({ minutesAgo: 60, attempt: 5 });

    expect(await requeuePoisonedAnalyses(db)).toBe(0);
    expect((await db.task.findUniqueOrThrow({ where: { id } })).status).toBe("POISONED");
  });

  it("чужие типы задач не трогает — у интерактивных шагов своя кнопка", async () => {
    const id = await poisoned({ minutesAgo: 60, attempt: 3, type: "GENERATE_VERDICT" });

    expect(await requeuePoisonedAnalyses(db)).toBe(0);
    expect((await db.task.findUniqueOrThrow({ where: { id } })).status).toBe("POISONED");
  });
});

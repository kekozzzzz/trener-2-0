/**
 * Тест оценки времени разбора (features/tournaments/estimate.ts).
 *
 * Проверяет, что сырой SQL исполняется на боевом Postgres и считает среднее время работы
 * (done_at − updated_at) недавних разборов; при отсутствии данных возвращает null (тогда UI
 * молчит, а не врёт).
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { enqueue } from "@/infrastructure/queue";
import { getAnalysisTimingSec } from "@/features/tournaments/estimate";

const db = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

// Заводит задачу и делает её DONE с заданным временем работы (done_at − updated_at = workSec).
// updated_at/done_at двигаем сырым SQL (updated_at — @updatedAt, через клиент не задать);
// UTC-стенку кладём через ::timestamp, как в reaper.test.ts.
async function makeDone(type: string, workSec: number): Promise<void> {
  const id = await enqueue(db, { type, payload: {} });
  const updatedAt = new Date(Date.now() - (workSec + 5) * 1000).toISOString();
  const doneAt = new Date(Date.now() - 5 * 1000).toISOString();
  await db.$executeRaw`
    UPDATE tasks
    SET status = 'DONE', updated_at = ${updatedAt}::timestamp, done_at = ${doneAt}::timestamp
    WHERE id = ${id}::uuid
  `;
}

beforeEach(async () => {
  await db.task.deleteMany();
});

afterAll(async () => {
  await db.task.deleteMany();
  await db.$disconnect();
});

describe("getAnalysisTimingSec", () => {
  it("нет данных → оба null (UI не показывает оценку)", async () => {
    const t = await getAnalysisTimingSec(db);
    expect(t).toEqual({ handSeconds: null, summarySeconds: null });
  });

  it("считает среднее время работы раздачи и сводки по DONE-задачам", async () => {
    await makeDone("GENERATE_HAND_ANALYSIS", 10);
    await makeDone("GENERATE_HAND_ANALYSIS", 20); // среднее ~15с
    await makeDone("GENERATE_TOURNAMENT_SUMMARY", 30);

    const t = await getAnalysisTimingSec(db);

    expect(t.handSeconds).not.toBeNull();
    expect(t.handSeconds!).toBeGreaterThan(10);
    expect(t.handSeconds!).toBeLessThan(20); // ~15
    expect(t.summarySeconds!).toBeGreaterThan(25);
    expect(t.summarySeconds!).toBeLessThan(35); // ~30
  });

  it("незавершённые задачи (PENDING) в расчёт не идут", async () => {
    await enqueue(db, { type: "GENERATE_HAND_ANALYSIS", payload: {} }); // PENDING
    const t = await getAnalysisTimingSec(db);
    expect(t.handSeconds).toBeNull();
  });
});

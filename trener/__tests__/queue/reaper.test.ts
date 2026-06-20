/**
 * Тесты reaper'а — возврата в очередь задач, зависших в PROCESSING.
 *
 * Сценарий из жизни: процесс умер во время обработки (pm2 restart) — задача
 * осталась в PROCESSING навсегда, т.к. claimTask берёт только PENDING.
 *
 * Покрывают:
 *  1. Зависшая PROCESSING с остатком попыток → PENDING на немедленный повтор.
 *  2. Зависшая PROCESSING с исчерпанными попытками → POISONED + тревога админу.
 *  3. Свежая PROCESSING (в пределах таймаута) → не трогается.
 *  4. PENDING/DONE → не трогаются.
 *
 * Адаптер уведомлений замокан. Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";

vi.mock("@/infrastructure/adapters/notify", () => ({
  safeNotifyAdmin: vi.fn().mockResolvedValue(undefined),
}));

import { enqueue, reapStuckTasks } from "@/infrastructure/queue";
import { safeNotifyAdmin } from "@/infrastructure/adapters/notify";

const db = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

// Заводит задачу и приводит её к нужному состоянию PROCESSING с заданным возрастом.
// updated_at двигаем сырым SQL: через типизированный клиент его не задать (@updatedAt).
// Колонка — timestamp WITHOUT time zone, и Prisma трактует её как UTC. Поэтому
// кладём UTC-стенку напрямую через ISO-строку + ::timestamp (этот каст игнорирует
// смещение в строке), иначе при не-UTC таймзоне сессии Postgres сконвертирует в
// локальное время и сравнение в reaper'е (Prisma читает как UTC) разъедется.
async function makeProcessing(
  type: string,
  attempt: number,
  ageMinutes: number
): Promise<string> {
  const id = await enqueue(db, { type, payload: {} });
  const updatedAtUtc = new Date(Date.now() - ageMinutes * 60_000).toISOString();
  await db.$executeRaw`
    UPDATE tasks
    SET status = 'PROCESSING', attempt = ${attempt}, updated_at = ${updatedAtUtc}::timestamp
    WHERE id = ${id}::uuid
  `;
  return id;
}

beforeEach(async () => {
  await db.task.deleteMany();
  vi.clearAllMocks();
});

afterAll(async () => {
  await db.task.deleteMany();
  await db.$disconnect();
});

describe("reapStuckTasks", () => {
  it("зависшую PROCESSING с остатком попыток возвращает в PENDING на немедленный повтор", async () => {
    const id = await makeProcessing("REAP_REQUEUE", 1, 20);

    const result = await reapStuckTasks(db);

    expect(result).toEqual({ requeued: 1, poisoned: 0 });
    const task = await db.task.findUnique({ where: { id } });
    expect(task!.status).toBe("PENDING");
    expect(task!.error).toMatch(/Reaped/);
    // run_after не в будущем → воркер возьмёт сразу.
    expect(task!.runAfter.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    // attempt не трогаем — он уже был учтён при захвате.
    expect(task!.attempt).toBe(1);
    expect(safeNotifyAdmin).not.toHaveBeenCalled();
  });

  it("зависшую PROCESSING с исчерпанными попытками отправляет в карантин с тревогой", async () => {
    const id = await makeProcessing("REAP_POISON", 3, 20);

    const result = await reapStuckTasks(db);

    expect(result).toEqual({ requeued: 0, poisoned: 1 });
    const task = await db.task.findUnique({ where: { id } });
    expect(task!.status).toBe("POISONED");

    expect(safeNotifyAdmin).toHaveBeenCalledTimes(1);
    const message = vi.mocked(safeNotifyAdmin).mock.calls[0][0];
    expect(message).toContain("REAP_POISON");
    expect(message).toContain("карантин");
  });

  it("свежую PROCESSING (в пределах таймаута) не трогает", async () => {
    const id = await makeProcessing("REAP_FRESH", 1, 1);

    const result = await reapStuckTasks(db);

    expect(result).toEqual({ requeued: 0, poisoned: 0 });
    const task = await db.task.findUnique({ where: { id } });
    expect(task!.status).toBe("PROCESSING");
    expect(safeNotifyAdmin).not.toHaveBeenCalled();
  });

  it("PENDING и DONE не трогает", async () => {
    const pendingId = await enqueue(db, { type: "NOOP", payload: {} });
    const doneId = await enqueue(db, { type: "NOOP", payload: {} });
    await db.task.update({ where: { id: doneId }, data: { status: "DONE", doneAt: new Date() } });

    const result = await reapStuckTasks(db);

    expect(result).toEqual({ requeued: 0, poisoned: 0 });
    expect((await db.task.findUnique({ where: { id: pendingId } }))!.status).toBe("PENDING");
    expect((await db.task.findUnique({ where: { id: doneId } }))!.status).toBe("DONE");
  });
});

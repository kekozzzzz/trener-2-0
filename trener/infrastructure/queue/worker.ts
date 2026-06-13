import type { PrismaClient } from "@prisma/client";
import type { RawTask, WorkerResult } from "./types";
import { getHandler } from "./registry";

// После MAX_ATTEMPTS неудач задача уходит в карантин (POISONED).
const MAX_ATTEMPTS = 3;
// Базовая задержка для retry: умножается на номер попытки.
const RETRY_DELAY_BASE_MS = 30_000;

export async function runWorkerOnce(db: PrismaClient): Promise<WorkerResult> {
  const task = await claimTask(db);
  if (!task) return { tasksProcessed: 0 };

  const handler = getHandler(task.type);

  if (!handler) {
    // Нет хендлера — сразу FAILED без retry (конфигурационная ошибка).
    await db.task.update({
      where: { id: task.id },
      data: {
        status: "FAILED",
        error: `No handler registered for task type: ${task.type}`,
      },
    });
    return { tasksProcessed: 1 };
  }

  try {
    await handler(task, db);
    await db.task.update({
      where: { id: task.id },
      data: { status: "DONE", doneAt: new Date() },
    });
  } catch (err) {
    const poison = task.attempt >= MAX_ATTEMPTS;
    await db.task.update({
      where: { id: task.id },
      data: poison
        ? { status: "POISONED", error: String(err) }
        : {
            status: "PENDING",
            error: String(err),
            runAfter: new Date(Date.now() + RETRY_DELAY_BASE_MS * task.attempt),
          },
    });
  }

  return { tasksProcessed: 1 };
}

// Атомарный захват задачи: SELECT ... FOR UPDATE SKIP LOCKED + UPDATE в одной транзакции.
// Гарантирует, что два параллельных воркера не возьмут одну и ту же задачу.
async function claimTask(db: PrismaClient): Promise<RawTask | null> {
  return db.$transaction(async (tx) => {
    // AT TIME ZONE 'UTC' явно говорит PostgreSQL, что значение хранится в UTC,
    // независимо от timezone текущей сессии.
    // NOW()::timestamp(3) — run_after хранится с точностью до миллисекунды
    // (округление при записи), без приведения NOW() к той же точности
    // свежепоставленная задача может на долю миллисекунды не пройти условие.
    const rows = await tx.$queryRaw<RawTask[]>`
      SELECT * FROM tasks
      WHERE status = 'PENDING'
        AND (run_after AT TIME ZONE 'UTC') <= NOW()::timestamp(3)
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    const row = rows[0];
    if (!row) return null;

    await tx.task.update({
      where: { id: row.id },
      data: { status: "PROCESSING", attempt: { increment: 1 } },
    });

    // Возвращаем строку с уже увеличенным attempt (UPDATE применён внутри той же TX).
    return { ...row, attempt: row.attempt + 1 };
  });
}

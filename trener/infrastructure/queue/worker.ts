import type { PrismaClient } from "@prisma/client";
import type { RawTask, WorkerResult } from "./types";
import { getHandler } from "./registry";
import { getStuckProcessingThresholdMs } from "@/config/queue";
import { safeNotifyAdmin } from "@/infrastructure/adapters/notify";

// После MAX_ATTEMPTS неудач задача уходит в карантин (POISONED).
const MAX_ATTEMPTS = 3;
// Базовая задержка для retry: умножается на номер попытки (30с, 60с).
const RETRY_DELAY_BASE_MS = 30_000;
// Короткая задержка для ВРЕМЕННОГО сбоя релея (молчание/обрыв сети): такой сбой проходит за
// секунды, и держать игрока по 30-60с зря — та самая боль «3 минуты над двумя раздачами»
// (2026-07-15). Релей моргнул → повторяем почти сразу (3с, 6с). Настоящая перегрузка сервиса
// (5xx) и брак контента модели остаются на штатном нарастающем backoff — там спешить незачем.
const RETRY_DELAY_TRANSIENT_MS = 3_000;

// Временный сбой релея, а не залёгший сервис/кривой ответ. RelayTimeoutError — релей молчал весь
// таймаут; сетевые обрывы undici (fetch failed / ECONNRESET / ConnectTimeout / socket hang up)
// resilient-fetch уже быстро переповторил и сдался — значит сеть шатается. И то, и другое чаще
// всего разовая икота КЗ-релея (через него весь LLM-трафик) — ей место в быстром повторе.
function isTransientRelayError(err: unknown): boolean {
  if ((err as { name?: string })?.name === "RelayTimeoutError") return true;
  return /RelayTimeoutError|таймаут вызова|fetch failed|ECONNRESET|ETIMEDOUT|ECONNREFUSED|ConnectTimeout|socket hang up|UND_ERR/i.test(
    String(err),
  );
}
// Порог «зависшей» PROCESSING-задачи вынесен в общий конфиг (config/queue.ts) — тем же
// значением пользуется health-проверка воркера, чтобы «зависло» трактовалось одинаково.

// Разгребает очередь до конца, гоняя `concurrency` воркеров параллельно. Каждый
// крутит runWorkerOnce, пока тот возвращает задачи. Параллельность безопасна:
// claimTask берёт задачу через FOR UPDATE SKIP LOCKED, так что два воркера не
// возьмут одну и ту же. Это и есть ускорение турнира: ~8 разборов раздач считаются
// разом, а не по одному. Возвращает суммарное число обработанных задач.
export async function drainQueue(db: PrismaClient, concurrency: number): Promise<number> {
  let total = 0;
  const lanes = Array.from({ length: Math.max(1, concurrency) }, async () => {
    let result;
    do {
      result = await runWorkerOnce(db);
      total += result.tasksProcessed;
    } while (result.tasksProcessed > 0);
  });
  await Promise.all(lanes);
  return total;
}

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
    // Временный сбой релея повторяем быстро (3с, 6с), прочее — штатный backoff (30с, 60с).
    const delayMs = isTransientRelayError(err)
      ? RETRY_DELAY_TRANSIENT_MS * task.attempt
      : RETRY_DELAY_BASE_MS * task.attempt;
    await db.task.update({
      where: { id: task.id },
      data: poison
        ? { status: "POISONED", error: String(err) }
        : {
            status: "PENDING",
            error: String(err),
            runAfter: new Date(Date.now() + delayMs),
          },
    });

    // Карантин — событие, требующее реакции человека (architecture/06-внешние-сервисы.md,
    // раздел 2.2): шлём тревогу администратору. Мягко — если бот недоступен, воркер
    // не падает: статус POISONED уже сохранён выше, уведомление вторично.
    if (poison) {
      await safeNotifyAdmin(
        `⚠️ Задача ${task.type} (id ${task.id}) ушла в карантин после ${MAX_ATTEMPTS} неудачных попыток.\nОшибка: ${String(err)}`
      );
    }
  }

  return { tasksProcessed: 1 };
}

export type ReapResult = { requeued: number; poisoned: number };

// Возвращает в очередь задачи, зависшие в PROCESSING дольше таймаута — процесс был
// прерван во время обработки, и сама себя такая задача не починит (claimTask берёт
// только PENDING). attempt уже инкрементирован при захвате, поэтому действуем как и
// обычный poison-путь: исчерпавшие попытки уходят в карантин (с тревогой), остальные —
// обратно в PENDING на немедленный повтор.
//
// Вызывать один раз в начале прогона очереди (не внутри runWorkerOnce — тот крутится
// в цикле). Время «висения» считаем по updated_at: claimTask бьёт его при захвате.
export async function reapStuckTasks(db: PrismaClient): Promise<ReapResult> {
  const cutoff = new Date(Date.now() - getStuckProcessingThresholdMs());

  // 1. Исчерпавшие попытки → карантин. Иначе при процессе, падающем именно на этой
  // задаче, она крутилась бы вечно: краш минует catch в runWorkerOnce, poison не наступит.
  const exhausted = await db.task.findMany({
    where: { status: "PROCESSING", updatedAt: { lt: cutoff }, attempt: { gte: MAX_ATTEMPTS } },
    select: { id: true, type: true },
  });

  if (exhausted.length > 0) {
    await db.task.updateMany({
      where: { id: { in: exhausted.map((t) => t.id) } },
      data: {
        status: "POISONED",
        error: "Reaped: зависла в PROCESSING (процесс прерван), попытки исчерпаны",
      },
    });
    for (const t of exhausted) {
      await safeNotifyAdmin(
        `⚠️ Задача ${t.type} (id ${t.id}) зависла в PROCESSING (процесс прерван) и ушла в карантин — попытки исчерпаны.`
      );
    }
  }

  // 2. Ещё есть попытки → обратно в очередь на немедленный повтор.
  const requeued = await db.task.updateMany({
    where: { status: "PROCESSING", updatedAt: { lt: cutoff }, attempt: { lt: MAX_ATTEMPTS } },
    data: {
      status: "PENDING",
      runAfter: new Date(),
      error: "Reaped: зависла в PROCESSING (процесс прерван), возвращена в очередь",
    },
  });

  return { requeued: requeued.count, poisoned: exhausted.length };
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
      ORDER BY priority DESC, created_at
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

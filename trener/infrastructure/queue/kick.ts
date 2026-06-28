import type { PrismaClient } from "@prisma/client";
import { drainQueue, reapStuckTasks } from "./worker";
import { getQueueConcurrency } from "@/config/queue";

// Мгновенный «пинок» очереди: будит воркер сразу после постановки задачи, не дожидаясь
// крона (раз в ~15с). Это убирает до-15-секундные простои — главный тормоз диалога и
// загрузки турнира.
//
// Single-flight + trailing: одновременно крутится только один прогон (чтобы не
// раздувать параллелизм сверх concurrency). Если пинок пришёл, пока прогон уже идёт —
// ставим флаг wantMore, и прогон в конце повторит цикл, гарантированно подобрав
// свежепоставленную задачу (без флага был бы шанс упустить задачу, поставленную ровно
// в момент, когда прогон опустошил очередь и собирался выйти).
//
// Фоновый (не дожидаемся в server action): на постоянном Node-процессе (pm2)
// незавершённый промис продолжает крутиться после ответа. Крон run-tasks каждые 15с —
// страховка, если фоновый прогон по какой-то причине оборвётся.
let active: Promise<void> | null = null;
let wantMore = false;

async function loop(db: PrismaClient): Promise<void> {
  const concurrency = getQueueConcurrency();
  do {
    wantMore = false;
    await reapStuckTasks(db);
    await drainQueue(db, concurrency);
  } while (wantMore);
}

// Запускает прогон очереди, если он ещё не идёт; иначе помечает «нужен ещё проход».
// Возвращает промис текущего прогона — server action его НЕ дожидается (`void kickWorker`),
// крон/админ-экшен могут дождаться. Ошибки фонового прогона не роняют вызвавший запрос:
// статус задач уже сохранён в БД воркером, прогон самовосстановится на следующем пинке/кроне.
export function kickWorker(db: PrismaClient): Promise<void> {
  // В тестах фоновый пинок выключен: воркер гоняют явно (runWorkerOnce/drainQueue). Иначе
  // fire-and-forget дренаж доживает до следующего тест-файла и воует его задачи из общей
  // очереди (флейки). Тот же приём, что и у лимитов (isUsageLimitEnabled). Исключение —
  // тесты самого kickWorker (drain.test.ts ставит QUEUE_KICK_IN_TEST=true и ждёт пинок).
  const inTest = process.env.NODE_ENV === "test" || process.env.VITEST;
  if (inTest && process.env.QUEUE_KICK_IN_TEST !== "true") return Promise.resolve();

  if (active) {
    wantMore = true;
    return active;
  }
  active = loop(db)
    .catch((err) => {
      console.error("[queue] фоновый прогон очереди упал:", err);
    })
    .finally(() => {
      active = null;
    });
  return active;
}

import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";

// Восстановление застрявших шагов очереди, которых ждёт игрок в реальном времени.
// Если задача сдохла окончательно (POISONED после исчерпанных попыток), сама она не
// разморозится — а на UI игрок иначе видит «готовим…» бесконечно. Статус-роут спрашивает
// детекторы и, если true, клиент показывает «не получилось, повторить»; действие «повторить»
// зовёт requeuePoisonedTasks. Привязка задачи к сущности — по ключу в JSON-payload
// (handId/tournamentId), как во всей очереди. Массовый разбор сюда НЕ входит: он
// самовосстанавливается (сломанная раздача не блокирует карточку, см. generate-hand-analysis).
//
// db-параметром (по умолчанию singleton) делаем функции тестируемыми на trener_test —
// тот же приём, что у buildDailyDigest/reapStuckTasks.

type Db = Pick<PrismaClient, "task">;

const DIALOGUE_STEP_TYPES = ["GENERATE_DIALOGUE_QUESTION", "GENERATE_VERDICT"];
const CHAT_STEP_TYPES = ["GENERATE_CHAT_REPLY"];
const PARSE_STEP_TYPES = ["PARSE_TOURNAMENT"];

// Есть ли карантинная (POISONED) задача указанных типов для этой сущности. PENDING/PROCESSING
// не считаем — они ещё в работе, их ждём штатно.
async function hasPoisonedTask(
  db: Db,
  types: string[],
  key: "handId" | "tournamentId",
  value: string,
): Promise<boolean> {
  const n = await db.task.count({
    where: { status: "POISONED", type: { in: types }, payload: { path: [key], equals: value } },
  });
  return n > 0;
}

// Сбрасывает карантинные задачи сущности обратно в PENDING (свежая попытка). Возвращает,
// сколько задач перезапущено. Идемпотентные шаги доделают недостающий вопрос/вердикт/ответ/
// разбор. Пинок воркера — на вызывающем (слое действий), тут только данные.
export async function requeuePoisonedTasks(
  db: Db,
  types: string[],
  key: "handId" | "tournamentId",
  value: string,
): Promise<number> {
  const { count } = await db.task.updateMany({
    where: { status: "POISONED", type: { in: types }, payload: { path: [key], equals: value } },
    data: { status: "PENDING", attempt: 0, runAfter: new Date(), error: null },
  });
  return count;
}

export const DIALOGUE_STEPS = DIALOGUE_STEP_TYPES;
export const CHAT_STEPS = CHAT_STEP_TYPES;
export const PARSE_STEPS = PARSE_STEP_TYPES;

// Диалог завис (state ANSWER_RECEIVED, а следующий вопрос/вердикт сдох в карантин).
export const isDialogueStepFailed = (handId: string, db: Db = prisma): Promise<boolean> =>
  hasPoisonedTask(db, DIALOGUE_STEP_TYPES, "handId", handId);

// Чат завис (последнее слово за игроком, а ответ тренера сдох в карантин).
export const isChatReplyFailed = (handId: string, db: Db = prisma): Promise<boolean> =>
  hasPoisonedTask(db, CHAT_STEP_TYPES, "handId", handId);

// Турнир завис в UPLOADED (парсинг сдох в карантин — маловероятно, парс идёт синхронно при
// загрузке, но ветка ошибки БД такое открывает).
export const isTournamentParseFailed = (tournamentId: string, db: Db = prisma): Promise<boolean> =>
  hasPoisonedTask(db, PARSE_STEP_TYPES, "tournamentId", tournamentId);

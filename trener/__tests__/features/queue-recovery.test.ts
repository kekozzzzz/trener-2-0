/**
 * Тесты восстановления застрявших шагов очереди (features/queue-recovery).
 *
 * Сценарий: шаг, которого ждёт игрок (следующий вопрос диалога / вердикт / ответ в чате /
 * парсинг турнира), сдох в карантин (POISONED). Детектор должен это увидеть (чтобы UI
 * показал «повторить» вместо вечной крутилки), а requeue — вернуть задачу в PENDING.
 *
 * Ключевое, что проверяем помимо логики: Prisma-фильтр по JSON-payload
 * (`payload: { path: [key], equals: value }`) реально матчит на боевом Postgres.
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { enqueue } from "@/infrastructure/queue";
import {
  isDialogueStepFailed,
  isChatReplyFailed,
  isTournamentParseFailed,
  requeuePoisonedTasks,
  DIALOGUE_STEPS,
} from "@/features/queue-recovery/queries";

const db = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

// Заводит задачу нужного типа с payload и сразу ставит в карантин (POISONED).
async function makePoisoned(type: string, payload: Record<string, unknown>): Promise<string> {
  const id = await enqueue(db, { type, payload });
  await db.task.update({ where: { id }, data: { status: "POISONED" } });
  return id;
}

beforeEach(async () => {
  await db.task.deleteMany();
});

afterAll(async () => {
  await db.task.deleteMany();
  await db.$disconnect();
});

describe("детектор застрявшего шага", () => {
  it("POISONED GENERATE_DIALOGUE_QUESTION по handId → диалог завис", async () => {
    await makePoisoned("GENERATE_DIALOGUE_QUESTION", { handId: "h1", roundNumber: 2 });
    expect(await isDialogueStepFailed("h1", db)).toBe(true);
    expect(await isDialogueStepFailed("h2", db)).toBe(false); // другой handId не задет
  });

  it("POISONED GENERATE_VERDICT тоже считается зависшим диалогом", async () => {
    await makePoisoned("GENERATE_VERDICT", { handId: "hv" });
    expect(await isDialogueStepFailed("hv", db)).toBe(true);
  });

  it("не-карантинная задача (PENDING) не считается зависшей", async () => {
    await enqueue(db, { type: "GENERATE_DIALOGUE_QUESTION", payload: { handId: "hp" } });
    expect(await isDialogueStepFailed("hp", db)).toBe(false);
  });

  it("тип чата и парсинга разведены по своим детекторам", async () => {
    await makePoisoned("GENERATE_CHAT_REPLY", { handId: "hc" });
    await makePoisoned("PARSE_TOURNAMENT", { tournamentId: "t1", parsed: {} });

    expect(await isChatReplyFailed("hc", db)).toBe(true);
    expect(await isTournamentParseFailed("t1", db)).toBe(true);
    // Чат-задача не поднимает флаг диалога, и наоборот.
    expect(await isDialogueStepFailed("hc", db)).toBe(false);
    expect(await isChatReplyFailed("h1", db)).toBe(false);
  });
});

describe("перезапуск застрявшего шага", () => {
  it("возвращает POISONED в PENDING (свежая попытка) и снимает флаг", async () => {
    const id = await makePoisoned("GENERATE_DIALOGUE_QUESTION", { handId: "hr" });
    await db.task.update({ where: { id }, data: { attempt: 3, error: "boom" } });

    const count = await requeuePoisonedTasks(db, DIALOGUE_STEPS, "handId", "hr");

    expect(count).toBe(1);
    const task = await db.task.findUnique({ where: { id } });
    expect(task!.status).toBe("PENDING");
    expect(task!.attempt).toBe(0);
    expect(task!.error).toBeNull();
    // Больше не «завис».
    expect(await isDialogueStepFailed("hr", db)).toBe(false);
  });

  it("не трогает задачи другой сущности", async () => {
    await makePoisoned("GENERATE_DIALOGUE_QUESTION", { handId: "keep" });

    const count = await requeuePoisonedTasks(db, DIALOGUE_STEPS, "handId", "other");

    expect(count).toBe(0);
    expect(await isDialogueStepFailed("keep", db)).toBe(true); // осталась в карантине
  });
});

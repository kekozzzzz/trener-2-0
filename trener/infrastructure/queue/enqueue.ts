import type { PrismaClient, Prisma } from "@prisma/client";
import type { TaskInput } from "./types";

type DbWithTask = Pick<PrismaClient, "task">;

// Приоритет по типу задачи. Живое/интерактивное — то, чего ждёт игрок прямо сейчас
// (следующий вопрос диалога, вердикт, ответ в чате) — идёт вперёд массового разбора
// (парсинг, разбор раздач, обзор, характеристика). Так залив пачки турниров не
// замораживает чужие живые диалоги. Число больше = раньше; по умолчанию 0.
const HIGH_PRIORITY_TYPES = new Set(["DIALOGUE_QUESTION", "VERDICT", "CHAT_REPLY"]);

function priorityFor(type: string): number {
  return HIGH_PRIORITY_TYPES.has(type) ? 100 : 0;
}

export async function enqueue(db: DbWithTask, input: TaskInput): Promise<string> {
  const task = await db.task.create({
    data: {
      type: input.type,
      payload: input.payload as unknown as Prisma.InputJsonValue,
      priority: input.priority ?? priorityFor(input.type),
    },
  });
  return task.id;
}

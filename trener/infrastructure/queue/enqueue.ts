import type { PrismaClient, Prisma } from "@prisma/client";
import type { TaskInput } from "./types";

type DbWithTask = Pick<PrismaClient, "task">;

export async function enqueue(db: DbWithTask, input: TaskInput): Promise<string> {
  const task = await db.task.create({
    data: {
      type: input.type,
      payload: input.payload as unknown as Prisma.InputJsonValue,
    },
  });
  return task.id;
}

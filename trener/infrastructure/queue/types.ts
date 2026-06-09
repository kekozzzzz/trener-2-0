import type { PrismaClient } from "@prisma/client";

// Строки из $queryRaw (snake_case = реальные имена колонок PostgreSQL)
export type RawTask = {
  id: string;
  type: string;
  payload: unknown;
  status: string;
  attempt: number;
  run_after: Date;
  done_at: Date | null;
  error: string | null;
  created_at: Date;
  updated_at: Date;
};

export type TaskInput = {
  type: string;
  payload: Record<string, unknown>;
};

export type WorkerResult = {
  tasksProcessed: number;
};

// Каждый шаг pipeline — функция с такой сигнатурой.
// Получает задачу и db-клиент (для INSERT-first результатов и т.п.).
// Бросает ошибку → воркер уходит в retry или poison.
export type StepHandler = (task: RawTask, db: PrismaClient) => Promise<void>;

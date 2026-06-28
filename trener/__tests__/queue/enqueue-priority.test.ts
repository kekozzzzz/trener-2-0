import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { enqueue } from "@/infrastructure/queue/enqueue";

// Приоритет задач очереди (Фаза C): живое/интерактивное вперёд массового разбора.
// Мок db.task.create — ловим, с каким priority создаётся задача. Реальной базы не нужно;
// сама сортировка по приоритету (claimTask) проверяется на живой базе отдельно.
function captureDb(): { db: PrismaClient; created: { priority?: number }[] } {
  const created: { priority?: number }[] = [];
  const db = {
    task: {
      create: async ({ data }: { data: { priority?: number } }) => {
        created.push(data);
        return { id: "task-id" };
      },
    },
  } as unknown as PrismaClient;
  return { db, created };
}

describe("enqueue — приоритет по типу задачи", () => {
  it("интерактив (вопрос диалога, вердикт, чат) — высокий приоритет", async () => {
    for (const type of ["DIALOGUE_QUESTION", "VERDICT", "CHAT_REPLY"]) {
      const { db, created } = captureDb();
      await enqueue(db, { type, payload: {} });
      expect(created[0].priority).toBe(100);
    }
  });

  it("массовый разбор (парсинг, раздачи, обзор, характеристика) — приоритет 0", async () => {
    for (const type of [
      "PARSE_TOURNAMENT",
      "GENERATE_HAND_ANALYSIS",
      "TOURNAMENT_SUMMARY",
      "PLAYER_CHARACTERISTIC",
    ]) {
      const { db, created } = captureDb();
      await enqueue(db, { type, payload: {} });
      expect(created[0].priority).toBe(0);
    }
  });

  it("явный priority в input переопределяет вычисленный по типу", async () => {
    const { db, created } = captureDb();
    await enqueue(db, { type: "PARSE_TOURNAMENT", payload: {}, priority: 50 });
    expect(created[0].priority).toBe(50);
  });
});

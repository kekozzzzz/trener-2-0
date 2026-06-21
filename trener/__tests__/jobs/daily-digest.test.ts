/**
 * Тесты сборки ежедневного дайджеста (infrastructure/jobs/daily-digest.ts).
 *
 * Покрывают:
 *  1. Формат и подсчёты — на замоканной БД (детерминированно, без сети/реальных данных).
 *  2. Предупреждение появляется при карантине/зависших и отсутствует, когда всё чисто.
 *  3. Дымовой тест на реальной тестовой БД — запросы (включая сырой SQL по tasks)
 *     выполняются без ошибок и возвращают строку с нужными блоками.
 */

import { describe, it, expect, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildDailyDigest } from "@/infrastructure/jobs/daily-digest";

// ── 1+2. Формат на замоканной БД ─────────────────────────────────────────────

function mockDb(opts: {
  players: number;
  tournaments: number;
  dialogues: number;
  pending: number;
  stuck: number;
  poisoned: number;
  avgSeconds: number | null;
}): PrismaClient {
  return {
    player: { count: async () => opts.players },
    tournament: { count: async () => opts.tournaments },
    dialogue: { count: async () => opts.dialogues },
    task: {
      // PENDING + runAfter — «зависшие»; PENDING без — «ждут»; POISONED — карантин.
      count: async ({ where }: { where: { status: string; runAfter?: unknown } }) => {
        if (where.status === "POISONED") return opts.poisoned;
        if (where.runAfter !== undefined) return opts.stuck;
        return opts.pending;
      },
    },
    $queryRaw: async () => [{ avg_seconds: opts.avgSeconds }],
    llmUsage: { findMany: async () => [] },
  } as unknown as PrismaClient;
}

describe("buildDailyDigest — формат", () => {
  it("подставляет все подсчёты и округляет среднее время", async () => {
    const db = mockDb({ players: 3, tournaments: 7, dialogues: 4, pending: 2, stuck: 0, poisoned: 0, avgSeconds: 12.6 });

    const text = await buildDailyDigest(db);

    expect(text).toContain("Новых регистраций: 3");
    expect(text).toContain("Загружено турниров: 7");
    expect(text).toContain("Новых диалогов: 4");
    expect(text).toContain("Ждут обработки: 2");
    expect(text).toContain("В карантине: 0");
    expect(text).toContain("Среднее время обработки: 13 с"); // round(12.6)
  });

  it("нет завершённых задач (avg = null) → среднее показывает прочерк", async () => {
    const db = mockDb({ players: 0, tournaments: 0, dialogues: 0, pending: 0, stuck: 0, poisoned: 0, avgSeconds: null });

    const text = await buildDailyDigest(db);

    expect(text).toContain("Среднее время обработки: —");
    expect(text).not.toContain("требует внимания");
  });

  it("есть зависшие или карантин → добавляет предупреждение", async () => {
    const db = mockDb({ players: 1, tournaments: 1, dialogues: 0, pending: 5, stuck: 3, poisoned: 1, avgSeconds: 40 });

    const text = await buildDailyDigest(db);

    expect(text).toContain("Зависших (просрочены): 3");
    expect(text).toContain("В карантине: 1");
    expect(text).toContain("⚠️ Очередь требует внимания");
  });
});

// ── 3. Дымовой тест на реальной БД ───────────────────────────────────────────

const realDb = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

afterAll(async () => {
  await realDb.$disconnect();
});

describe("buildDailyDigest — дымовой тест на реальной БД", () => {
  it("запросы выполняются и возвращают сводку с блоками", async () => {
    const text = await buildDailyDigest(realDb);

    expect(text).toContain("Сводка за сутки");
    expect(text).toContain("👥 Пользователи");
    expect(text).toContain("⚙️ Очередь");
  });
});

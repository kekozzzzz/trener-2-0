/**
 * Тесты сборки ежедневного дайджеста (infrastructure/jobs/daily-digest.ts).
 *
 * Покрывают:
 *  1. Формат и подсчёты — на замоканной БД (детерминированно, без сети/реальных данных).
 *  2. Предупреждение появляется при карантине/зависших и отсутствует, когда всё чисто.
 *  3. Дымовой тест на реальной тестовой БД — запросы (включая сырой SQL по tasks)
 *     выполняются без ошибок и возвращают строку с нужными блоками.
 */

import { describe, it, expect, afterAll, vi, beforeEach, afterEach } from "vitest";
import { PrismaClient } from "@prisma/client";
import { buildDailyDigest, runDailyDigest } from "@/infrastructure/jobs/daily-digest";

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

// ── 2b. Честный статус доставки (runDailyDigest) ─────────────────────────────
// Дайджест не должен рапортовать «отправлено», когда релей молчал: runDailyDigest
// возвращает факт доставки, по которому cron-роут отдаёт sent / failed.

const ZERO_DIGEST = { players: 0, tournaments: 0, dialogues: 0, pending: 0, stuck: 0, poisoned: 0, avgSeconds: null };

describe("runDailyDigest — честный статус доставки", () => {
  const NOTIFY_ENV = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_ADMIN_CHAT_ID", "TELEGRAM_BASE_URL", "TELEGRAM_CALL_RETRIES"] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of NOTIFY_ENV) saved[k] = process.env[k];
  });
  afterEach(() => {
    for (const k of NOTIFY_ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("бот не настроен (noop) → доставка условно успешна (true)", async () => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_ADMIN_CHAT_ID;

    await expect(runDailyDigest(mockDb(ZERO_DIGEST))).resolves.toBe(true);
  });

  it("бот настроен, но релей недоступен → false (не рапортуем «sent» вслепую)", async () => {
    process.env.TELEGRAM_BOT_TOKEN = "123:ABC";
    process.env.TELEGRAM_ADMIN_CHAT_ID = "440359604";
    process.env.TELEGRAM_BASE_URL = "https://92.60.75.87/tg";
    process.env.TELEGRAM_CALL_RETRIES = "0";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("релей молчит")));
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(runDailyDigest(mockDb(ZERO_DIGEST))).resolves.toBe(false);
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

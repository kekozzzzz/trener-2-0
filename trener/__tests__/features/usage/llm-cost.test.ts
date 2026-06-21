import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { costFromUsage, costWithoutCache } from "@/features/usage/llm-usage";
import { buildCostReport } from "@/features/usage/cost-report";

// Ставки sonnet-4.6: вход $3, выход $15, запись-кэш $3.75, чтение-кэш $0.30 за 1M.

describe("costFromUsage", () => {
  it("считает стоимость без кэша по входу/выходу", () => {
    const cost = costFromUsage(
      { inputTokens: 1000, outputTokens: 500, cacheWriteTokens: 0, cacheReadTokens: 0 },
      "claude-sonnet-4-6",
    );
    // (1000*3 + 500*15) / 1e6 = 10500/1e6
    expect(cost).toBeCloseTo(0.0105, 6);
  });

  it("учитывает кэш дешевле обычного входа", () => {
    const cost = costFromUsage(
      { inputTokens: 0, outputTokens: 200, cacheWriteTokens: 0, cacheReadTokens: 3000 },
      "claude-sonnet-4-6",
    );
    // (200*15 + 3000*0.3) / 1e6 = (3000 + 900)/1e6
    expect(cost).toBeCloseTo(0.0039, 6);
  });
});

describe("costWithoutCache", () => {
  it("кэшевые токены считает как обычный вход полной ценой", () => {
    const cf = costWithoutCache(
      { inputTokens: 0, outputTokens: 200, cacheWriteTokens: 0, cacheReadTokens: 3000 },
      "claude-sonnet-4-6",
    );
    // ((0+0+3000)*3 + 200*15)/1e6 = (9000 + 3000)/1e6
    expect(cf).toBeCloseTo(0.012, 6);
  });
});

describe("buildCostReport", () => {
  const rows = [
    { playerId: "A", model: "claude-sonnet-4-6", inputTokens: 1000, outputTokens: 500, cacheWriteTokens: 0, cacheReadTokens: 0, costUsd: 0.0105, player: { email: "a@x.ru" } },
    { playerId: "A", model: "claude-sonnet-4-6", inputTokens: 0, outputTokens: 200, cacheWriteTokens: 0, cacheReadTokens: 3000, costUsd: 0.0039, player: { email: "a@x.ru" } },
    { playerId: "B", model: "claude-sonnet-4-6", inputTokens: 2000, outputTokens: 100, cacheWriteTokens: 0, cacheReadTokens: 0, costUsd: 0.0075, player: { email: null } },
  ];
  const db = { llmUsage: { findMany: async () => rows } } as unknown as PrismaClient;

  it("агрегирует по игроку, считает итог и кэш-нетто", async () => {
    const report = await buildCostReport(db, 24);

    expect(report.totalRequests).toBe(3);
    expect(report.totalCostUsd).toBeCloseTo(0.0219, 6);

    // Топ по расходам: A (2 запроса, 0.0144) выше B (1, 0.0075).
    expect(report.topPlayers[0]).toMatchObject({ playerId: "A", requests: 2 });
    expect(report.topPlayers[0].costUsd).toBeCloseTo(0.0144, 6);
    expect(report.topPlayers[1]).toMatchObject({ playerId: "B", requests: 1, email: null });

    // Экономия кэша: только row2 читался из кэша → положительная.
    expect(report.cacheNetUsd).toBeGreaterThan(0);
    expect(report.cacheNetUsd).toBeCloseTo(0.0081, 6);
  });
});

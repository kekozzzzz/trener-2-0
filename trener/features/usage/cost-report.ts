import type { PrismaClient } from "@prisma/client";
import { costWithoutCache } from "./llm-usage";

// Расход по одному игроку за период.
export type PlayerCost = {
  playerId: string;
  email: string | null;
  requests: number;
  costUsd: number;
};

// Сводка расходов LLM за период — для дайджеста и /status.
export type CostReport = {
  sinceHours: number;
  totalRequests: number;
  totalCostUsd: number;
  // Эффект кэша за период: >0 — кэш сэкономил, <0 — стоил лишнего.
  // Считается честно: (сколько было бы без кэша) минус (сколько заплатили по факту).
  cacheNetUsd: number;
  topPlayers: PlayerCost[];
};

// Собирает сводку из строк llm_usage. db передаётся снаружи — тестируется на моке.
export async function buildCostReport(
  db: PrismaClient,
  sinceHours: number,
  topN = 10,
): Promise<CostReport> {
  const since = new Date(Date.now() - sinceHours * 3600_000);

  const rows = await db.llmUsage.findMany({
    where: { createdAt: { gte: since } },
    select: {
      playerId: true,
      model: true,
      inputTokens: true,
      outputTokens: true,
      cacheWriteTokens: true,
      cacheReadTokens: true,
      costUsd: true,
      player: { select: { email: true } },
    },
  });

  let totalCostUsd = 0;
  let withoutCacheUsd = 0;
  const byPlayer = new Map<string, PlayerCost>();

  for (const r of rows) {
    const cost = Number(r.costUsd);
    totalCostUsd += cost;
    withoutCacheUsd += costWithoutCache(
      {
        inputTokens: r.inputTokens,
        outputTokens: r.outputTokens,
        cacheWriteTokens: r.cacheWriteTokens,
        cacheReadTokens: r.cacheReadTokens,
      },
      r.model,
    );

    const entry = byPlayer.get(r.playerId) ?? {
      playerId: r.playerId,
      email: r.player?.email ?? null,
      requests: 0,
      costUsd: 0,
    };
    entry.requests += 1;
    entry.costUsd += cost;
    byPlayer.set(r.playerId, entry);
  }

  const topPlayers = [...byPlayer.values()]
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, topN);

  return {
    sinceHours,
    totalRequests: rows.length,
    totalCostUsd,
    cacheNetUsd: withoutCacheUsd - totalCostUsd,
    topPlayers,
  };
}

// Доллары в короткую строку: $0.0123 → "$0.0123", крупные — 2 знака.
export function formatUsd(v: number): string {
  const abs = Math.abs(v);
  const digits = abs >= 1 ? 2 : 4;
  return `$${v.toFixed(digits)}`;
}

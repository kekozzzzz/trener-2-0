/**
 * Доказательство, что кредиты (израсходованный бюджет) обнуляются на новом периоде.
 * Метр считает СУММУ LlmUsage.costUsd только внутри окна текущего периода
 * (spentThisPeriodUsd с since = начало периода). Расход прошлого периода в окно не
 * попадает → на новом месяце бюджет свежий. Реальная тестовая база.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import { spentThisPeriodUsd } from "@/features/usage/budget";

const PLAYER_ID = "44444444-0000-0000-0000-000000000001";
const DAY_MS = 24 * 60 * 60 * 1000;

async function addUsage(costUsd: number, createdAt: Date): Promise<void> {
  await prisma.llmUsage.create({
    data: {
      playerId: PLAYER_ID,
      step: "TEST",
      model: "test",
      inputTokens: 0,
      outputTokens: 0,
      cacheWriteTokens: 0,
      cacheReadTokens: 0,
      costUsd,
      createdAt,
    },
  });
}

beforeAll(async () => {
  await prisma.player.upsert({
    where: { id: PLAYER_ID },
    update: {},
    create: { id: PLAYER_ID, email: "budget-window@trener.local" },
  });
});

beforeEach(async () => {
  await prisma.llmUsage.deleteMany({ where: { playerId: PLAYER_ID } });
});

afterAll(async () => {
  await prisma.llmUsage.deleteMany({ where: { playerId: PLAYER_ID } });
  await prisma.player.delete({ where: { id: PLAYER_ID } }).catch(() => {});
  await prisma.$disconnect();
});

describe("spentThisPeriodUsd — окно периода (обнуление кредитов)", () => {
  it("расход прошлого периода НЕ считается в текущем", async () => {
    const now = Date.now();
    await addUsage(3.0, new Date(now - 40 * DAY_MS)); // прошлый период
    await addUsage(1.25, new Date(now - 5 * DAY_MS)); // текущий период

    const periodStart = new Date(now - 10 * DAY_MS);
    const spent = await spentThisPeriodUsd(prisma, PLAYER_ID, periodStart);

    expect(spent).toBeCloseTo(1.25, 5); // только текущий, $3 из прошлого месяца обнулились
  });

  it("пустой период → 0", async () => {
    const spent = await spentThisPeriodUsd(prisma, PLAYER_ID, new Date(Date.now() - 10 * DAY_MS));
    expect(spent).toBe(0);
  });
});

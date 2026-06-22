import { describe, it, expect } from "vitest";
import { proratedUpgradeKopecks } from "@/features/subscription/proration";

const DAY_MS = 24 * 60 * 60 * 1000;
const BASIC = 69_000;
const STANDARD = 149_000;

describe("proratedUpgradeKopecks (доплата = разница цен за остаток периода)", () => {
  const now = new Date("2026-06-22T00:00:00.000Z");
  const DIFF = STANDARD - BASIC; // 80 000

  it("остался полный период → полная разница цен", () => {
    const next = new Date(now.getTime() + 30 * DAY_MS);
    expect(proratedUpgradeKopecks(BASIC, STANDARD, next, now, 30)).toBe(DIFF); // 80 000
  });

  it("осталась половина периода → половина разницы", () => {
    const next = new Date(now.getTime() + 15 * DAY_MS);
    expect(proratedUpgradeKopecks(BASIC, STANDARD, next, now, 30)).toBe(DIFF / 2); // 40 000
  });

  it("период истёк (остаток 0) → 0 (платить нечего за прошедший период)", () => {
    expect(proratedUpgradeKopecks(BASIC, STANDARD, now, now, 30)).toBe(0);
  });

  it("оплачено вперёд (остаток больше периода) → не больше одной полной разницы", () => {
    const next = new Date(now.getTime() + 45 * DAY_MS);
    expect(proratedUpgradeKopecks(BASIC, STANDARD, next, now, 30)).toBe(DIFF);
  });

  it("не уходит в минус, если новый тариф дешевле (это не апгрейд)", () => {
    const next = new Date(now.getTime() + 30 * DAY_MS);
    expect(proratedUpgradeKopecks(STANDARD, BASIC, next, now, 30)).toBe(0);
  });
});

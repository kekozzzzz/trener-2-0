import { describe, it, expect } from "vitest";
import { proratedUpgradeKopecks } from "@/features/subscription/proration";

const DAY_MS = 24 * 60 * 60 * 1000;
const BASIC = 69_000;
const STANDARD = 149_000;

describe("proratedUpgradeKopecks", () => {
  const now = new Date("2026-06-22T00:00:00.000Z");

  it("остался полный период → зачитываем всю цену текущего тарифа", () => {
    const next = new Date(now.getTime() + 30 * DAY_MS);
    expect(proratedUpgradeKopecks(BASIC, STANDARD, next, now, 30)).toBe(STANDARD - BASIC); // 80 000
  });

  it("осталась половина периода → зачёт половины цены", () => {
    const next = new Date(now.getTime() + 15 * DAY_MS);
    expect(proratedUpgradeKopecks(BASIC, STANDARD, next, now, 30)).toBe(STANDARD - BASIC / 2); // 114 500
  });

  it("период истёк (остаток 0) → полная цена нового тарифа", () => {
    expect(proratedUpgradeKopecks(BASIC, STANDARD, now, now, 30)).toBe(STANDARD);
  });

  it("оплачено вперёд (остаток больше периода) → зачёт не больше одного периода", () => {
    const next = new Date(now.getTime() + 45 * DAY_MS);
    expect(proratedUpgradeKopecks(BASIC, STANDARD, next, now, 30)).toBe(STANDARD - BASIC);
  });

  it("никогда не уходит в минус (если зачёт больше цены нового)", () => {
    const next = new Date(now.getTime() + 30 * DAY_MS);
    expect(proratedUpgradeKopecks(STANDARD, BASIC, next, now, 30)).toBe(0);
  });
});

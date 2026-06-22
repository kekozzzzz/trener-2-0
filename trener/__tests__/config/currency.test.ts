import { describe, it, expect } from "vitest";
import { usdToKopecks, formatUsd } from "@/config/plans";
import { fakeExchangeRate } from "@/infrastructure/adapters/exchange-rate/fake";

describe("usdToKopecks (пересчёт $ → копейки ₽)", () => {
  it("округляет произведение до целого рубля", () => {
    expect(usdToKopecks(9, 95)).toBe(85_500); // 9 × 95 = 855 ₽
    expect(usdToKopecks(20, 90)).toBe(180_000); // 20 × 90 = 1800 ₽
    expect(usdToKopecks(50, 95)).toBe(475_000); // 50 × 95 = 4750 ₽
  });

  it("дробный курс округляется до целого рубля", () => {
    expect(usdToKopecks(9, 90.46)).toBe(81_400); // 814.14 → 814 ₽
    expect(usdToKopecks(9, 90.5)).toBe(81_500); // 814.5 → 815 ₽ (округление вверх)
  });
});

describe("formatUsd", () => {
  it("показывает доллары", () => {
    expect(formatUsd(9)).toBe("$9");
    expect(formatUsd(50)).toBe("$50");
  });
});

describe("fakeExchangeRate", () => {
  it("отдаёт положительный фиксированный курс (запасной из конфига)", async () => {
    const rate = await fakeExchangeRate.getUsdRub();
    expect(rate).toBeGreaterThan(0);
  });
});

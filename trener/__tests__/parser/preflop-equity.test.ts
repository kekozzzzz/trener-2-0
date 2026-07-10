import { describe, it, expect } from "vitest";
import { fastEval7, preflopEquityVsRange, preflopEquityVsRangeFast } from "@/parser/preflop-equity";
import { cardSetValue, compareValues } from "@/parser/made-hand";

const RANK: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const SUIT: Record<string, number> = { c: 0, d: 1, h: 2, s: 3 };
const parse = (c: string) => ({ r: RANK[c[0]], s: SUIT[c[1]] });

function fullDeck(): string[] {
  const d: string[] = [];
  for (const r of "23456789TJQKA") for (const s of "cdhs") d.push(r + s);
  return d;
}

function pick7(): string[] {
  const d = fullDeck();
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d.slice(0, 7);
}

describe("fastEval7 — сверка с проверенным оценщиком", () => {
  it("порядок сравнения совпадает с made-hand.ts на 5000 случайных пар рук", () => {
    for (let t = 0; t < 5000; t++) {
      const A = pick7();
      const B = pick7();
      const fast = Math.sign(fastEval7(A.map(parse)) - fastEval7(B.map(parse)));
      const trusted = compareValues(cardSetValue(A), cardSetValue(B));
      expect(fast).toBe(Math.sign(trusted));
    }
  });
});

describe("preflopEquityVsRange — точное префлоп-эквити перебором", () => {
  it("AA против KK ≈ 82%", () => {
    const eq = preflopEquityVsRange(["Ah", "As"], ["KK"]);
    expect(eq?.combosLive).toBe(6);
    expect(eq?.equityPct).toBeGreaterThanOrEqual(80);
    expect(eq?.equityPct).toBeLessThanOrEqual(84);
  }, 120000);

  it("AKs против QQ ≈ 46%", () => {
    const eq = preflopEquityVsRange(["As", "Ks"], ["QQ"]);
    expect(eq?.equityPct).toBeGreaterThanOrEqual(44);
    expect(eq?.equityPct).toBeLessThanOrEqual(48);
  }, 120000);

  it("кривой вход → null", () => {
    expect(preflopEquityVsRange(["As"], ["KK"])).toBeNull(); // одна карта
    expect(preflopEquityVsRange(["As", "As"], ["KK"])).toBeNull(); // дубль
    expect(preflopEquityVsRange(["As", "Ks"], [])).toBeNull(); // пустой диапазон
  });
});

describe("preflopEquityVsRangeFast — мгновенный лукап по таблице", () => {
  it("AA против KK ≈ 82-83%", () => {
    const eq = preflopEquityVsRangeFast(["Ah", "As"], ["KK"]);
    expect(eq?.equityPct).toBeGreaterThanOrEqual(80);
    expect(eq?.equityPct).toBeLessThanOrEqual(84);
  });

  it("совпадает с точным перебором в пределах ±2% на диапазоне", () => {
    const range = ["QQ", "JJ", "AKs", "AQs", "KQs"];
    const fast = preflopEquityVsRangeFast(["Ah", "Kh"], range)!;
    const exact = preflopEquityVsRange(["Ah", "Kh"], range)!;
    expect(Math.abs(fast.equityPct - exact.equityPct)).toBeLessThanOrEqual(2);
  }, 60000);

  it("мгновенно на большом диапазоне (<50 мс vs 22 с у перебора)", () => {
    const range = ["AA", "KK", "QQ", "JJ", "TT", "99", "88", "AKs", "AKo", "AQs", "AQo", "AJs", "KQs", "ATs", "A5s", "A4s", "KJs", "QJs", "JTs"];
    const t0 = performance.now();
    const eq = preflopEquityVsRangeFast(["Ah", "Ks"], range);
    const ms = performance.now() - t0;
    expect(eq).not.toBeNull();
    expect(ms).toBeLessThan(50);
  });
});

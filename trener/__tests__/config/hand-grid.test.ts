import { describe, it, expect } from "vitest";
import {
  cellCode,
  comboCount,
  combosOf,
  percentOf,
  formatRange,
  GRID_RANKS,
  TOTAL_COMBOS,
} from "@/config/poker/hand-grid";

describe("cellCode — раскладка 169-сетки", () => {
  it("углы и диагональ", () => {
    expect(cellCode(0, 0)).toBe("AA"); // верх-лево — тузы
    expect(cellCode(12, 12)).toBe("22"); // низ-право — двойки
    expect(cellCode(0, 1)).toBe("AKs"); // верх-право от диагонали — одномастные
    expect(cellCode(1, 0)).toBe("AKo"); // низ-лево — разномастные
    expect(cellCode(0, 12)).toBe("A2s");
    expect(cellCode(12, 0)).toBe("A2o");
  });

  it("каждая ячейка даёт уникальный код, всего 169", () => {
    const codes = new Set<string>();
    for (let r = 0; r < GRID_RANKS.length; r++)
      for (let c = 0; c < GRID_RANKS.length; c++) codes.add(cellCode(r, c));
    expect(codes.size).toBe(169);
  });
});

describe("счёт комбинаций", () => {
  it("пара 6, одномастная 4, разномастная 12", () => {
    expect(comboCount("AA")).toBe(6);
    expect(comboCount("AKs")).toBe(4);
    expect(comboCount("AKo")).toBe(12);
  });

  it("вся сетка = 1326 комбинаций", () => {
    const all: string[] = [];
    for (let r = 0; r < GRID_RANKS.length; r++)
      for (let c = 0; c < GRID_RANKS.length; c++) all.push(cellCode(r, c));
    expect(combosOf(all)).toBe(TOTAL_COMBOS);
    expect(percentOf(all)).toBeCloseTo(100, 5);
  });
});

describe("formatRange — компактная нотация", () => {
  it("пустой выбор", () => {
    expect(formatRange([])).toBe("");
  });

  it("пары: до тузов → «+», ограниченный ряд → диапазон, одиночная", () => {
    expect(formatRange(["AA", "KK", "QQ", "JJ"])).toBe("JJ+");
    expect(formatRange(["QQ", "JJ", "TT"])).toBe("QQ-TT");
    expect(formatRange(["77"])).toBe("77");
  });

  it("кикеры: ряд до старшего кикера → «+», одиночная, разрыв даёт две группы", () => {
    expect(formatRange(["AKs", "AQs", "AJs"])).toBe("AJs+");
    expect(formatRange(["KQs"])).toBe("KQs");
    expect(formatRange(["AKo", "AQo"])).toBe("AQo+");
    expect(formatRange(["A5s", "A4s", "A2s"])).toBe("A5s-A4s, A2s");
  });

  it("смешанный диапазон: пары, затем одномастные, затем разномастные", () => {
    expect(formatRange(["AA", "KK", "AKs", "AQs", "AKo"])).toBe("KK+, AQs+, AKo");
  });
});

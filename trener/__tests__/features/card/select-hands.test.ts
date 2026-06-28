import { describe, it, expect } from "vitest";
import type { HandImportance, ParsedHand } from "@/parser/types";
import { selectHandsForCard } from "@/features/card/select-hands";

function makeHand(importanceLevel: HandImportance, chipResult: number): ParsedHand {
  return {
    importanceLevel,
    chipResult,
    tableSnapshot: { seats: [], heroCards: [], board: [], actions: [], potTotal: 0 },
  };
}

function repeat(importanceLevel: HandImportance, chipResults: number[]): ParsedHand[] {
  return chipResults.map((chipResult) => makeHand(importanceLevel, chipResult));
}

describe("selectHandsForCard", () => {
  it("отличная сессия: все спорные (1 крит + 7 сильных) + средними до нижней планки = 10", () => {
    const hands = [
      ...repeat("CRITICAL", [-500]),
      ...repeat("STRONG", [100, 200, 300, 400, 500, 600, 700]), // 7 спорных побед — берём ВСЕ
      ...repeat("MEDIUM", [-50, -100, -150, -200, -250, -300]), // добиваем до 10: топ-2 по |chipResult|
    ];

    const selected = selectHandsForCard(hands);

    expect(selected).toHaveLength(10);
    expect(selected.filter((h) => h.importanceLevel === "CRITICAL")).toHaveLength(1);
    expect(selected.filter((h) => h.importanceLevel === "STRONG")).toHaveLength(7);
    expect(selected.filter((h) => h.importanceLevel === "MEDIUM")).toHaveLength(2);

    // сильные больше не режутся — присутствуют все 7
    expect(selected.filter((h) => h.importanceLevel === "STRONG").map((h) => h.chipResult).sort((a, b) => a - b)).toEqual([
      100, 200, 300, 400, 500, 600, 700,
    ]);

    // топ-2 MEDIUM по |chipResult| (добивка до нижней планки)
    expect(selected.filter((h) => h.importanceLevel === "MEDIUM").map((h) => h.chipResult).sort((a, b) => a - b)).toEqual([
      -300, -250,
    ]);
  });

  it("много спорных: масштаб до потолка 20, средние не добавляются", () => {
    const hands = [
      ...repeat("CRITICAL", [-900, -800, -700, -600, -500]), // 5 критических
      ...repeat("STRONG", Array.from({ length: 20 }, (_, i) => (i + 1) * 100)), // 20 сильных
      ...repeat("MEDIUM", [-10, -20, -30]),
    ];

    const selected = selectHandsForCard(hands);

    // 25 спорных → берём 20 (5 крит + топ-15 сильных), средние не нужны
    expect(selected).toHaveLength(20);
    expect(selected.filter((h) => h.importanceLevel === "CRITICAL")).toHaveLength(5);
    expect(selected.filter((h) => h.importanceLevel === "STRONG")).toHaveLength(15);
    expect(selected.filter((h) => h.importanceLevel === "MEDIUM")).toHaveLength(0);

    // топ-15 сильных по chipResult — самые крупные (от 600 до 2000)
    const minStrong = Math.min(
      ...selected.filter((h) => h.importanceLevel === "STRONG").map((h) => h.chipResult),
    );
    expect(minStrong).toBe(600);
  });

  it("спорных между планками (12): размер тянется за ними, средние не добавляются", () => {
    const hands = [
      ...repeat("CRITICAL", [-500, -400, -300]), // 3
      ...repeat("STRONG", [100, 200, 300, 400, 500, 600, 700, 800, 900]), // 9
      ...repeat("MEDIUM", [-10, -20, -30, -40, -50]),
    ];

    const selected = selectHandsForCard(hands);

    // 12 спорных в коридоре [10, 20] → ровно 12, средние не нужны
    expect(selected).toHaveLength(12);
    expect(selected.filter((h) => h.importanceLevel === "MEDIUM")).toHaveLength(0);
  });

  it("обычная сессия: 3 критических + 2 сильных + 5 средних = 10", () => {
    const hands = [
      ...repeat("CRITICAL", [-900, -800, -700]),
      ...repeat("STRONG", [100, 200]),
      ...repeat("MEDIUM", [-10, -20, -30, -40, -50, -60, -70]), // 7 кандидатов, берём топ-5
    ];

    const selected = selectHandsForCard(hands);

    expect(selected).toHaveLength(10);
    expect(selected.filter((h) => h.importanceLevel === "CRITICAL")).toHaveLength(3);
    expect(selected.filter((h) => h.importanceLevel === "STRONG")).toHaveLength(2);
    expect(selected.filter((h) => h.importanceLevel === "MEDIUM")).toHaveLength(5);
  });

  it("провальная сессия: 3 критических + 1 сильная + 6 средних = 10", () => {
    const hands = [
      ...repeat("CRITICAL", [-900, -800, -700]),
      ...repeat("STRONG", [100]),
      ...repeat("MEDIUM", [-10, -20, -30, -40, -50, -60, -70]), // 7 кандидатов, берём топ-6
    ];

    const selected = selectHandsForCard(hands);

    expect(selected).toHaveLength(10);
    expect(selected.filter((h) => h.importanceLevel === "CRITICAL")).toHaveLength(3);
    expect(selected.filter((h) => h.importanceLevel === "STRONG")).toHaveLength(1);
    expect(selected.filter((h) => h.importanceLevel === "MEDIUM")).toHaveLength(6);
  });

  it("раздач меньше 10 — возвращает все", () => {
    const hands = [
      ...repeat("CRITICAL", [-500, -400]),
      ...repeat("STRONG", [100]),
      ...repeat("MEDIUM", [-10, -20]),
    ];

    const selected = selectHandsForCard(hands);

    expect(selected).toHaveLength(5);
  });

  it("сильных раздач нет совсем — слоты честно уходят в средние, ничего не подменяется", () => {
    const hands = [
      ...repeat("CRITICAL", [-500]),
      ...repeat("MEDIUM", Array.from({ length: 15 }, (_, i) => -(i + 1) * 10)),
    ];

    const selected = selectHandsForCard(hands);

    expect(selected).toHaveLength(10);
    expect(selected.filter((h) => h.importanceLevel === "STRONG")).toHaveLength(0);
    expect(selected.filter((h) => h.importanceLevel === "CRITICAL")).toHaveLength(1);
    expect(selected.filter((h) => h.importanceLevel === "MEDIUM")).toHaveLength(9);
  });

  it("итоговый порядок — хронологический, по позиции в исходном hands[]", () => {
    const hands: ParsedHand[] = [
      makeHand("MEDIUM", -10), // 0
      makeHand("CRITICAL", -500), // 1
      makeHand("STRONG", 200), // 2
      makeHand("MEDIUM", -20), // 3
    ];

    const selected = selectHandsForCard(hands);

    expect(selected).toEqual([hands[0], hands[1], hands[2], hands[3]]);
  });
});

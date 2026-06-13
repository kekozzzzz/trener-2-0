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
  it("отличная сессия: 1 критическая + до 5 сильных + остальное средними = 10", () => {
    const hands = [
      ...repeat("CRITICAL", [-500]),
      ...repeat("STRONG", [100, 200, 300, 400, 500, 600, 700]), // 7 кандидатов, берём топ-5
      ...repeat("MEDIUM", [-50, -100, -150, -200, -250, -300]), // 6 кандидатов, берём топ-4 по |chipResult|
    ];

    const selected = selectHandsForCard(hands);

    expect(selected).toHaveLength(10);
    expect(selected.filter((h) => h.importanceLevel === "CRITICAL")).toHaveLength(1);
    expect(selected.filter((h) => h.importanceLevel === "STRONG")).toHaveLength(5);
    expect(selected.filter((h) => h.importanceLevel === "MEDIUM")).toHaveLength(4);

    // топ-5 STRONG по chipResult (порядок в выдаче — хронологический, поэтому сравниваем как множество)
    expect(selected.filter((h) => h.importanceLevel === "STRONG").map((h) => h.chipResult).sort((a, b) => a - b)).toEqual([
      300, 400, 500, 600, 700,
    ]);

    // топ-4 MEDIUM по |chipResult| (порядок в выдаче — хронологический, поэтому сравниваем как множество)
    expect(selected.filter((h) => h.importanceLevel === "MEDIUM").map((h) => h.chipResult).sort((a, b) => a - b)).toEqual([
      -300, -250, -200, -150,
    ]);
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

import { describe, it, expect } from "vitest";
import type { HandImportance, ParsedHand, TableAction } from "@/parser/types";
import { selectHandsForCard } from "@/features/card/select-hands";

// heroPlayed — по умолчанию false (пустые действия = тривиальная раздача). Для проверки
// подстраховки от пустой карточки задаём Hero добровольное действие.
function makeHand(importanceLevel: HandImportance, chipResult: number, heroPlayed = false): ParsedHand {
  const actions: TableAction[] = heroPlayed
    ? [{ actor: "Hero", action: "RAISE", street: "PREFLOP" } as TableAction]
    : [];
  return {
    importanceLevel,
    chipResult,
    tableSnapshot: { seats: [], heroCards: [], board: [], actions, potTotal: 0 },
  };
}

function repeat(importanceLevel: HandImportance, chipResults: number[]): ParsedHand[] {
  return chipResults.map((chipResult) => makeHand(importanceLevel, chipResult));
}

describe("selectHandsForCard", () => {
  it("показывает ТОЛЬКО спорные (1 крит + 7 сильных = 8); средние-мусор не добираются", () => {
    const hands = [
      ...repeat("CRITICAL", [-500]),
      ...repeat("STRONG", [100, 200, 300, 400, 500, 600, 700]),
      ...repeat("MEDIUM", [-50, -100, -150, -200, -250, -300]), // сброс мусора — НЕ показываем
    ];

    const selected = selectHandsForCard(hands);

    expect(selected).toHaveLength(8);
    expect(selected.filter((h) => h.importanceLevel === "CRITICAL")).toHaveLength(1);
    expect(selected.filter((h) => h.importanceLevel === "STRONG")).toHaveLength(7);
    expect(selected.filter((h) => h.importanceLevel === "MEDIUM")).toHaveLength(0);
  });

  it("много спорных: масштаб до потолка 20", () => {
    const hands = [
      ...repeat("CRITICAL", [-900, -800, -700, -600, -500]), // 5
      ...repeat("STRONG", Array.from({ length: 20 }, (_, i) => (i + 1) * 100)), // 20
      ...repeat("MEDIUM", [-10, -20, -30]),
    ];

    const selected = selectHandsForCard(hands);

    expect(selected).toHaveLength(20);
    expect(selected.filter((h) => h.importanceLevel === "CRITICAL")).toHaveLength(5);
    expect(selected.filter((h) => h.importanceLevel === "STRONG")).toHaveLength(15);
    expect(selected.filter((h) => h.importanceLevel === "MEDIUM")).toHaveLength(0);
    // топ-15 сильных по chipResult (от 600 до 2000)
    const minStrong = Math.min(...selected.filter((h) => h.importanceLevel === "STRONG").map((h) => h.chipResult));
    expect(minStrong).toBe(600);
  });

  it("маленький турнир: мало спорных = мало раздач (3 крит + 2 сильных = 5, не добиваем до 10)", () => {
    const hands = [
      ...repeat("CRITICAL", [-900, -800, -700]),
      ...repeat("STRONG", [100, 200]),
      ...repeat("MEDIUM", [-10, -20, -30, -40, -50, -60, -70]), // мусор — не показываем
    ];

    const selected = selectHandsForCard(hands);

    expect(selected).toHaveLength(5);
    expect(selected.filter((h) => h.importanceLevel === "MEDIUM")).toHaveLength(0);
  });

  it("совсем маленький турнир: 1 спорная раздача — показываем ровно её, а не десяток пустышек", () => {
    const hands = [
      ...repeat("CRITICAL", [-500]),
      ...repeat("MEDIUM", Array.from({ length: 15 }, (_, i) => -(i + 1) * 10)),
    ];

    const selected = selectHandsForCard(hands);

    expect(selected).toHaveLength(1);
    expect(selected[0].importanceLevel).toBe("CRITICAL");
  });

  it("подстраховка: спорных нет, но Hero играл руки → до 3 самых весомых сыгранных", () => {
    const hands = [
      makeHand("MEDIUM", -30, true), // играл
      makeHand("MEDIUM", -100, true), // играл, самая весомая
      makeHand("MEDIUM", -10, false), // сброс мусора — не в счёт
      makeHand("MEDIUM", -70, true), // играл
      makeHand("MEDIUM", -5, false), // сброс мусора
    ];

    const selected = selectHandsForCard(hands);

    // 3 сыгранные (не сброшенные), в хронологическом порядке
    expect(selected).toHaveLength(3);
    expect(selected.map((h) => h.chipResult)).toEqual([-30, -100, -70]);
  });

  it("турнир без единой сыгранной руки (сплошной фолд) → пустая карточка, честно", () => {
    const hands = repeat("MEDIUM", [-10, -20, -30]); // все сброшены на префлопе (heroPlayed=false)

    const selected = selectHandsForCard(hands);

    expect(selected).toHaveLength(0);
  });

  it("итоговый порядок — хронологический, по позиции в исходном hands[]", () => {
    const hands: ParsedHand[] = [
      makeHand("MEDIUM", -10), // 0 — не спорная, не показываем
      makeHand("CRITICAL", -500), // 1
      makeHand("STRONG", 200), // 2
      makeHand("MEDIUM", -20), // 3 — не показываем
    ];

    const selected = selectHandsForCard(hands);

    expect(selected).toEqual([hands[1], hands[2]]);
  });
});

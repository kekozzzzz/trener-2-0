/**
 * Тесты агрегатора карты открываний игрока (features/profile/open-chart.ts,
 * plans/2026-06-29-чарты-открываний-игрока.md).
 *
 * Чистая функция, без БД. Покрывают: подсчёт частоты рейз-открытий по позиции, флаг
 * `wide`, сведение ранних на UTG/MP по positionName, разделение по позициям, сортировку,
 * отсев неоткрытий/BB, и ОТДЕЛЬНЫЙ слой SB-лимпов (комплит блайнда при фолде до тебя).
 */

import { describe, it, expect } from "vitest";
import type { Position, TableAction, TableSnapshot } from "@/parser/types";
import { aggregateOpenChart } from "@/features/profile/open-chart";

// Стол на 40bb (BB=100): Hero открывается РЕЙЗОМ первым из заданной позиции.
function openSnap(
  heroCards: string[],
  position: Position,
  positionName?: string,
): { tableData: TableSnapshot } {
  return {
    tableData: {
      seats: [
        { label: "Player 1", position: "SB", startingStack: 4000 },
        { label: "Player 2", position: "BB", startingStack: 4000 },
        { label: "Hero", position, positionName, startingStack: 4000 },
      ],
      heroCards,
      board: [],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      ],
      potTotal: 0,
    },
  };
}

// Hero на SB завершает блайнд коллом (лимп) при фолде до него.
function sbLimpSnap(heroCards: string[]): { tableData: TableSnapshot } {
  return {
    tableData: {
      seats: [
        { label: "Hero", position: "SB", startingStack: 4000 },
        { label: "Player 2", position: "BB", startingStack: 4000 },
        { label: "Player 3", position: "BTN", startingStack: 4000 },
      ],
      heroCards,
      board: [],
      actions: [
        { street: "PREFLOP", actor: "Hero", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 50 },
      ],
      potTotal: 0,
    },
  };
}

describe("aggregateOpenChart — рейзы", () => {
  it("считает частоту, флаг wide и сводит раннюю без имени в MP", () => {
    const chart = aggregateOpenChart([
      openSnap(["7c", "2d"], "EARLY"), // 72o из ранней — заведомо шире нормы
      openSnap(["7h", "2s"], "EARLY"),
      openSnap(["Ac", "Kc"], "EARLY"), // AKs — в диапазоне
    ]);
    expect(chart.raise.MP).toEqual([
      { code: "72o", count: 2, wide: true },
      { code: "AKs", count: 1, wide: false },
    ]);
    expect(chart.raise.UTG).toEqual([]);
  });

  it("раннюю с positionName=UTG ведёт в UTG, а не в MP", () => {
    const chart = aggregateOpenChart([openSnap(["Ac", "Kc"], "EARLY", "UTG")]);
    expect(chart.raise.UTG).toEqual([{ code: "AKs", count: 1, wide: false }]);
    expect(chart.raise.MP).toEqual([]);
  });

  it("разделяет открытия по позициям и сортирует по частоте", () => {
    const chart = aggregateOpenChart([
      openSnap(["7c", "2d"], "BTN"),
      openSnap(["8c", "2d"], "BTN"),
      openSnap(["8d", "2h"], "BTN"),
      openSnap(["8h", "2s"], "BTN"),
      openSnap(["Ac", "Kc"], "CO"),
    ]);
    expect(chart.raise.BTN.map((c) => c.code)).toEqual(["82o", "72o"]);
    expect(chart.raise.BTN[0].count).toBe(3);
    expect(chart.raise.CO).toEqual([{ code: "AKs", count: 1, wide: false }]);
  });

  it("несудимую позицию (BB) не учитывает", () => {
    const chart = aggregateOpenChart([openSnap(["Ac", "Kc"], "BB")]);
    expect(chart.raise).toEqual({ UTG: [], MP: [], HJ: [], CO: [], BTN: [], SB: [] });
    expect(chart.sbLimp).toEqual([]);
  });
});

describe("aggregateOpenChart — SB-лимпы", () => {
  it("SB-лимп попадает в sbLimp, а не в рейзы; wide всегда false", () => {
    const chart = aggregateOpenChart([
      sbLimpSnap(["Ac", "5c"]), // A5s лимп
      sbLimpSnap(["Ad", "5d"]), // ещё раз A5s
      sbLimpSnap(["5h", "4h"]), // 54s лимп
    ]);
    expect(chart.sbLimp).toEqual([
      { code: "A5s", count: 2, wide: false },
      { code: "54s", count: 1, wide: false },
    ]);
    expect(chart.raise.SB).toEqual([]);
  });

  it("рейз со SB идёт в raise.SB, лимп со SB — в sbLimp (не смешиваются)", () => {
    const chart = aggregateOpenChart([
      openSnap(["Ac", "Kc"], "SB"), // рейз со SB
      sbLimpSnap(["6c", "5c"]), // лимп со SB
    ]);
    expect(chart.raise.SB).toEqual([{ code: "AKs", count: 1, wide: false }]);
    expect(chart.sbLimp).toEqual([{ code: "65s", count: 1, wide: false }]);
  });

  it("пустой вход — рейзы и лимпы пусты", () => {
    const chart = aggregateOpenChart([]);
    expect(chart.raise).toEqual({ UTG: [], MP: [], HJ: [], CO: [], BTN: [], SB: [] });
    expect(chart.sbLimp).toEqual([]);
  });
});

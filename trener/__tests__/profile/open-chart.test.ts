/**
 * Тесты агрегатора карты открываний игрока (features/profile/open-chart.ts,
 * plans/2026-06-29-чарты-открываний-игрока.md).
 *
 * Чистая функция, без БД. Покрывают: подсчёт частоты открытий по позиции, флаг
 * `wide` по мягкому порогу RFI-чарта, СВЕДЕНИЕ ранних на UTG/MP по positionName,
 * разделение по позициям, отсев неоткрытий и несудимых позиций (BB), сортировку.
 */

import { describe, it, expect } from "vitest";
import type { Position, TableAction, TableSnapshot } from "@/parser/types";
import { aggregateOpenChart } from "@/features/profile/open-chart";

// Стол на 40bb (BB=100): Hero открывается рейзом первым из заданной позиции.
// positionName — точное имя места (UTG/LJ/…); по нему ранние разводятся на UTG/MP.
function openSnap(
  heroCards: string[],
  position: Position,
  positionName?: string,
): { tableData: TableSnapshot } {
  const actions: TableAction[] = [
    { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 50 },
    { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 },
    { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
    { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
  ];
  return {
    tableData: {
      seats: [
        { label: "Player 1", position: "SB", startingStack: 4000 },
        { label: "Player 2", position: "BB", startingStack: 4000 },
        { label: "Hero", position, positionName, startingStack: 4000 },
      ],
      heroCards,
      board: [],
      actions,
      potTotal: 0,
    },
  };
}

// Лимп перед Hero → не открытие (для отсева).
function limpSnap(heroCards: string[], position: Position): { tableData: TableSnapshot } {
  return {
    tableData: {
      seats: [
        { label: "Player 1", position: "SB", startingStack: 4000 },
        { label: "Player 2", position: "BB", startingStack: 4000 },
        { label: "Hero", position, startingStack: 4000 },
      ],
      heroCards,
      board: [],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 3", action: "CALL", amount: 100 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 400 },
      ],
      potTotal: 0,
    },
  };
}

describe("aggregateOpenChart", () => {
  it("считает частоту, флаг wide и сводит раннюю без точного имени в MP", () => {
    // Однозначные руки, не пограничные: 72o — мусор, не открывают ниоткуда (всегда
    // wide); AKs — премиум, в любом чарте (никогда не wide). Так тест не ломается от
    // тонкой настройки RFI-чарта. Ранняя без positionName → MP (прочие ранние, шире).
    const chart = aggregateOpenChart([
      openSnap(["7c", "2d"], "EARLY"), // 72o из ранней — заведомо шире нормы
      openSnap(["7h", "2s"], "EARLY"), // ещё раз 72o
      openSnap(["Ac", "Kc"], "EARLY"), // AKs — в диапазоне, не wide
    ]);

    expect(chart.MP).toEqual([
      { code: "72o", count: 2, wide: true },
      { code: "AKs", count: 1, wide: false },
    ]);
    expect(chart.UTG).toEqual([]);
    expect(chart.HJ).toEqual([]);
  });

  it("раннюю с positionName=UTG ведёт в UTG, а не в MP", () => {
    const chart = aggregateOpenChart([openSnap(["Ac", "Kc"], "EARLY", "UTG")]);
    expect(chart.UTG).toEqual([{ code: "AKs", count: 1, wide: false }]);
    expect(chart.MP).toEqual([]);
  });

  it("разделяет открытия по позициям", () => {
    const chart = aggregateOpenChart([
      openSnap(["Ac", "Kc"], "CO"),
      openSnap(["Ad", "Kd"], "BTN"),
    ]);
    expect(chart.CO).toEqual([{ code: "AKs", count: 1, wide: false }]);
    expect(chart.BTN).toEqual([{ code: "AKs", count: 1, wide: false }]);
    expect(chart.MP).toEqual([]);
  });

  it("сортирует клетки по частоте (чаще — выше)", () => {
    const chart = aggregateOpenChart([
      openSnap(["7c", "2d"], "BTN"), // 72o ×1 — заведомо wide
      openSnap(["8c", "2d"], "BTN"), // 82o ×3 — заведомо wide
      openSnap(["8d", "2h"], "BTN"),
      openSnap(["8h", "2s"], "BTN"),
    ]);
    expect(chart.BTN.map((c) => c.code)).toEqual(["82o", "72o"]);
    expect(chart.BTN[0].count).toBe(3);
  });

  it("отсевает неоткрытия (лимп перед Hero)", () => {
    const chart = aggregateOpenChart([limpSnap(["Kc", "8c"], "EARLY")]);
    expect(chart.MP).toEqual([]);
  });

  it("несудимую позицию (BB) не учитывает", () => {
    const chart = aggregateOpenChart([openSnap(["Ac", "Kc"], "BB")]);
    expect(chart).toEqual({ UTG: [], MP: [], HJ: [], CO: [], BTN: [], SB: [] });
  });

  it("пустой вход — все позиции пусты", () => {
    const chart = aggregateOpenChart([]);
    expect(chart).toEqual({ UTG: [], MP: [], HJ: [], CO: [], BTN: [], SB: [] });
  });
});

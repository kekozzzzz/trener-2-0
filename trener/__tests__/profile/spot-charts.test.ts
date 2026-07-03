/**
 * Тесты агрегатора зеркал остальных спотов (features/profile/spot-charts.ts,
 * plans/2026-07-03-твои-чарты-все-споты.md).
 *
 * Чистая функция, без БД. Покрывают: защиту BB (слои колл/3-бет, флаг wide только у
 * 3-бета), игру против опена, изоляцию лимпера, пуш-фолд (разводка по стек-бэндам),
 * отсев фолдов и чужих спотов, сортировку по частоте.
 */

import { describe, it, expect } from "vitest";
import type { Position, TableSnapshot } from "@/parser/types";
import { aggregateSpotCharts } from "@/features/profile/spot-charts";

// Hero на BB (стек 40bb), впереди одиночный опен с заданной позиции — Hero отвечает.
function bbDefenseSnap(
  heroCards: string[],
  openerPosition: Position,
  heroAction: "FOLD" | "CALL" | "RAISE",
): { tableData: TableSnapshot } {
  return {
    tableData: {
      seats: [
        { label: "Player 1", position: openerPosition, startingStack: 4000 },
        { label: "Player 2", position: "SB", startingStack: 4000 },
        { label: "Hero", position: "BB", startingStack: 4000 },
      ],
      heroCards,
      board: [],
      actions: [
        { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 250 },
        { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: heroAction, amount: heroAction === "RAISE" ? 800 : 150 },
      ],
      potTotal: 0,
    },
  };
}

// Hero НЕ на BB (стек 40bb), впереди одиночный опен — Hero отвечает.
function vsOpenSnap(
  heroCards: string[],
  heroPosition: Position,
  heroAction: "FOLD" | "CALL" | "RAISE",
): { tableData: TableSnapshot } {
  return {
    tableData: {
      seats: [
        { label: "Player 1", position: "EARLY", positionName: "UTG", startingStack: 4000 },
        { label: "Hero", position: heroPosition, startingStack: 4000 },
        { label: "Player 3", position: "SB", startingStack: 4000 },
        { label: "Player 4", position: "BB", startingStack: 4000 },
      ],
      heroCards,
      board: [],
      actions: [
        { street: "PREFLOP", actor: "Player 3", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Player 4", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 250 },
        { street: "PREFLOP", actor: "Hero", action: heroAction, amount: heroAction === "RAISE" ? 800 : 250 },
      ],
      potTotal: 0,
    },
  };
}

// Впереди лимпер, Hero (стек 40bb) рейзит — изоляция.
function isoSnap(heroCards: string[], heroPosition: Position): { tableData: TableSnapshot } {
  return {
    tableData: {
      seats: [
        { label: "Player 1", position: "EARLY", positionName: "UTG", startingStack: 4000 },
        { label: "Hero", position: heroPosition, startingStack: 4000 },
        { label: "Player 3", position: "SB", startingStack: 4000 },
        { label: "Player 4", position: "BB", startingStack: 4000 },
      ],
      heroCards,
      board: [],
      actions: [
        { street: "PREFLOP", actor: "Player 3", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Player 4", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 100 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 400 },
      ],
      potTotal: 0,
    },
  };
}

// Hero первым в банк идёт олл-ин на заданном стеке (в BB).
function pushSnap(heroCards: string[], heroPosition: Position, stackBb: number): { tableData: TableSnapshot } {
  return {
    tableData: {
      seats: [
        { label: "Hero", position: heroPosition, startingStack: stackBb * 100 },
        { label: "Player 2", position: "SB", startingStack: 4000 },
        { label: "Player 3", position: "BB", startingStack: 4000 },
      ],
      heroCards,
      board: [],
      actions: [
        { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Player 3", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: stackBb * 100 },
      ],
      potTotal: 0,
    },
  };
}

describe("aggregateSpotCharts — защита BB", () => {
  it("разводит колл и 3-бет по слоям; wide только у 3-бета вне нормы", () => {
    const charts = aggregateSpotCharts([
      bbDefenseSnap(["7c", "6c"], "BTN", "CALL"), // 76s колл vs BTN — норма
      bbDefenseSnap(["7h", "6h"], "BTN", "CALL"),
      bbDefenseSnap(["Ac", "Ad"], "BTN", "RAISE"), // AA 3-бет — в норме
      bbDefenseSnap(["7c", "2d"], "BTN", "RAISE"), // 72o 3-бет — явный спью
    ]);
    expect(charts.bbDefense.BTN.call).toEqual([{ code: "76s", count: 2, wide: false }]);
    expect(charts.bbDefense.BTN.threeBet).toEqual([
      { code: "AA", count: 1, wide: false },
      { code: "72o", count: 1, wide: true },
    ]);
  });

  it("фолд на BB не учитывает; позиция открывашки разводится", () => {
    const charts = aggregateSpotCharts([
      bbDefenseSnap(["7c", "2d"], "BTN", "FOLD"),
      bbDefenseSnap(["Ac", "Ad"], "CO", "RAISE"),
    ]);
    expect(charts.bbDefense.BTN.call).toEqual([]);
    expect(charts.bbDefense.BTN.threeBet).toEqual([]);
    expect(charts.bbDefense.CO.threeBet).toEqual([{ code: "AA", count: 1, wide: false }]);
  });
});

describe("aggregateSpotCharts — против опена (не BB)", () => {
  it("колл не судим, 3-бет судим по нашей позиции", () => {
    const charts = aggregateSpotCharts([
      vsOpenSnap(["Tc", "Td"], "BTN", "CALL"), // TT холодный колл — не судим
      vsOpenSnap(["7c", "2d"], "BTN", "RAISE"), // 72o 3-бет — спью
      vsOpenSnap(["Ac", "Kc"], "BTN", "RAISE"), // AKs 3-бет — норма
    ]);
    expect(charts.vsOpen.BTN.call).toEqual([{ code: "TT", count: 1, wide: false }]);
    expect(charts.vsOpen.BTN.threeBet).toEqual([
      { code: "72o", count: 1, wide: true },
      { code: "AKs", count: 1, wide: false },
    ]);
  });

  it("раздача защиты BB не попадает в чарт против опена (и наоборот)", () => {
    const charts = aggregateSpotCharts([bbDefenseSnap(["Ac", "Ad"], "BTN", "RAISE")]);
    const vsOpenTotal = Object.values(charts.vsOpen).flatMap((l) => [...l.call, ...l.threeBet]);
    expect(vsOpenTotal).toEqual([]);
    expect(charts.bbDefense.BTN.threeBet).toHaveLength(1);
  });
});

describe("aggregateSpotCharts — изоляция", () => {
  it("считает изоляции по позиции с флагом wide и сортирует по частоте", () => {
    const charts = aggregateSpotCharts([
      isoSnap(["7c", "2d"], "BTN"), // 72o изоляция — шире нормы
      isoSnap(["7h", "2s"], "BTN"),
      isoSnap(["Ac", "Kc"], "BTN"), // AKs — норма
    ]);
    expect(charts.iso.BTN).toEqual([
      { code: "72o", count: 2, wide: true },
      { code: "AKs", count: 1, wide: false },
    ]);
  });
});

describe("aggregateSpotCharts — пуш-фолд", () => {
  it("разводит пуши по стек-бэндам; wide по чарту бэнда", () => {
    const charts = aggregateSpotCharts([
      pushSnap(["Ac", "Kc"], "SB", 8), // AKs пуш 8bb — норма, SHORT
      pushSnap(["7c", "2d"], "SB", 12), // 72o пуш 12bb — шире нормы, MID
    ]);
    expect(charts.push.SHORT.SB).toEqual([{ code: "AKs", count: 1, wide: false }]);
    expect(charts.push.MID.SB).toEqual([{ code: "72o", count: 1, wide: true }]);
  });

  it("стек от 15bb — не пуш-фолд, не учитывается", () => {
    const charts = aggregateSpotCharts([pushSnap(["Ac", "Kc"], "SB", 20)]);
    expect(charts.push.SHORT.SB).toEqual([]);
    expect(charts.push.MID.SB).toEqual([]);
  });
});

describe("aggregateSpotCharts — пустой вход", () => {
  it("все зеркала пустые", () => {
    const charts = aggregateSpotCharts([]);
    expect(charts.bbDefense.UTG).toEqual({ call: [], threeBet: [] });
    expect(charts.vsOpen.SB).toEqual({ call: [], threeBet: [] });
    expect(charts.iso.BTN).toEqual([]);
    expect(charts.push.SHORT.UTG).toEqual([]);
  });
});

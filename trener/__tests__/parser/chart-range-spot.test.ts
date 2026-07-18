/**
 * Резолвер спота для панели эталонного диапазона (parser/chart-range-spot.ts, Артём 18.07:
 * «везде, где чарты используются, их засунуть»).
 *
 * Главное, что проверяем — ПОРЯДОК: резолвер обязан зеркалить spotVerdict() из
 * preflop-chart-fact.ts. Иначе панель покажет не тот чарт, по которому тренер судил раздачу.
 * Отдельно: споты без сетки (лимп, сквиз) обязаны вернуть null и НЕ проваливаться в RFI —
 * раздача уже опознана, чужой диапазон там показывать нельзя.
 */

import { describe, it, expect } from "vitest";
import type { Position, TableAction, TableSnapshot } from "@/parser/types";
import { heroChartRangeSpot } from "@/parser/chart-range-spot";

// Стол на 40bb (BB=100): SB и BB постят, дальше — префлоп. Hero на CO по умолчанию.
function snap(opts: {
  heroCards: string[];
  heroPosition?: Position;
  heroStack?: number;
  seats?: { label: string; position: Position; startingStack: number; positionName?: string }[];
  preflop: TableAction[];
}): TableSnapshot {
  return {
    seats: opts.seats ?? [
      { label: "Player 1", position: "SB", startingStack: 4000 },
      { label: "Player 2", position: "BB", startingStack: 4000 },
      { label: "Hero", position: opts.heroPosition ?? "CO", startingStack: opts.heroStack ?? 4000 },
    ],
    heroCards: opts.heroCards,
    board: [],
    actions: [
      { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 },
      ...opts.preflop,
    ],
    potTotal: 0,
  };
}

describe("heroChartRangeSpot", () => {
  it("Hero открывает рейзом первым в банк → спот RFI со своей позицией", () => {
    const s = snap({
      heroCards: ["Ah", "Qd"],
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 },
      ],
    });
    expect(heroChartRangeSpot(s)).toEqual({ kind: "rfi", position: "CO", heroCode: "AQo" });
  });

  // Инвариант порядка: лимп опознан как спот, но сетки для него нет. Провалиться в RFI нельзя —
  // иначе игроку показали бы диапазон ОТКРЫТИЯ на раздаче, где он вошёл лимпом.
  it("Hero вошёл лимпом → null, а НЕ диапазон открытия (RFI)", () => {
    const s = snap({
      heroCards: ["Kc", "7c"],
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 100 },
      ],
    });
    expect(heroChartRangeSpot(s)).toBeNull();
  });

  it("Hero на BB против одиночного опена → спот защиты BB с позицией опенера", () => {
    const s = snap({
      heroCards: ["Qh", "Jd"],
      heroPosition: "BB",
      seats: [
        { label: "Player 1", position: "SB", startingStack: 4000 },
        { label: "Hero", position: "BB", startingStack: 4000 },
        { label: "Player 2", position: "BTN", startingStack: 4000 },
      ],
      preflop: [
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 220 },
        { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 120 },
      ],
    });
    const spot = heroChartRangeSpot(s);
    expect(spot?.kind).toBe("bbdefense");
    expect(spot).toMatchObject({ opener: "BTN", heroCode: "QJo" });
  });

  it("короткий соперник пушит первым, Hero коллит → спот «с чем коллить опен-олл-ин»", () => {
    const s = snap({
      heroCards: ["2c", "2h"],
      heroPosition: "BB",
      seats: [
        { label: "Player 1", position: "SB", startingStack: 4000 },
        { label: "Hero", position: "BB", startingStack: 4000 },
        // Парсер хранит крупную позицию EARLY + уточнение в positionName (как в реальных HH).
        { label: "Player 2", position: "EARLY", startingStack: 1200, positionName: "UTG" }, // 12 BB — пуш-фолд
      ],
      preflop: [
        { street: "PREFLOP", actor: "Player 2", action: "ALL_IN", amount: 1200 },
        { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 1100 },
      ],
    });
    const spot = heroChartRangeSpot(s);
    expect(spot?.kind).toBe("callvspush");
    expect(spot).toMatchObject({ pusherBand: "MID", heroCode: "22" });
  });

  it("раздача без чартового спота (Hero просто сбросил) → null", () => {
    const s = snap({
      heroCards: ["7c", "2d"],
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "RAISE", amount: 250 },
        { street: "PREFLOP", actor: "Hero", action: "FOLD" },
      ],
    });
    expect(heroChartRangeSpot(s)?.kind).not.toBe("rfi");
  });
});

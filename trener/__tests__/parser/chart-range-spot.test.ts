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
import { preflopChartFact } from "@/parser/preflop-chart-fact";

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

  // Артём 18.07: под разбором ривер-блефа показался чарт ОТКРЫТИЯ — «в этом смысла нет».
  // Раздача ушла на постфлоп, разбор про постфлоп, а открытие было стандартным → сетка молчит.
  it("стандартный вход + раздача разыграна постфлопом → null (чарт открытия там шум)", () => {
    const s = snap({
      heroCards: ["Ah", "Qd"], // AQo с CO — в чарте открытий
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 },
        { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 150 },
        { street: "FLOP", actor: "Player 2", action: "CHECK" },
        { street: "FLOP", actor: "Hero", action: "BET", amount: 300 },
      ],
    });
    expect(heroChartRangeSpot(s)).toBeNull();
  });

  // Но исключение, которое Артём назвал сразу следом: «постфлоп сыграл верно, а заходить не стоило».
  // Вход ВНЕ чарта → вопрос «а с чем заходить» возникает → сетку показываем даже на постфлоп-раздаче.
  it("вход ВНЕ чарта + постфлоп → сетку показываем (вопрос «а с чем заходить»)", () => {
    const s = snap({
      heroCards: ["Kh", "2d"], // K2o с CO — вне чарта открытий
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 },
        { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 150 },
        { street: "FLOP", actor: "Player 2", action: "CHECK" },
        { street: "FLOP", actor: "Hero", action: "BET", amount: 300 },
      ],
    });
    expect(heroChartRangeSpot(s)).toEqual({ kind: "rfi", position: "CO", heroCode: "K2o" });
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

// Артём 19.07: «раз вспомнили — надо делать, у других-то такие ситуации могут быть». В хедз-апе
// баттон постит малый блайнд и ходит первым, то есть по сути это SB. Раньше он получал ярлык BTN и
// раздача уезжала в ШЕСТИМАКСОВЫЙ чарт баттона — вдвое уже правильного. Отдельные данные заводить не
// понадобилось: спот «малый блайнд против большого» — это ровно игра вдвоём, и чарты под него у
// продукта уже есть (RFI для SB и блайнд-против-блайнда, защита 69% — как раз ширина хедз-апа).
describe("хедз-ап судится чартами блайнд-против-блайнда, а не баттона 6-max", () => {
  const heads = (heroPos: "SB" | "BB", preflop: TableAction[]) =>
    snap({
      heroCards: ["Kh", "7d"],
      heroPosition: heroPos,
      seats: [
        { label: "Hero", position: heroPos, startingStack: 4000 },
        { label: "Player 1", position: heroPos === "SB" ? "BB" : "SB", startingStack: 4000 },
      ],
      preflop,
    });

  it("открытие с баттона (=SB) идёт в чарт малого блайнда, а не баттона", () => {
    const s = heads("SB", [{ street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 }]);
    expect(heroChartRangeSpot(s)).toEqual({ kind: "rfi", position: "SB", heroCode: "K7o" });
  });

  it("K7o с баттона в хедз-апе — СТАНДАРТНОЕ открытие, а не «вне чарта»", () => {
    const s = heads("SB", [{ street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 }]);
    expect(preflopChartFact(s)).toContain("стандартное открытие");
  });

  it("защита большого блайнда идёт в чарт блайнд-против-блайнда", () => {
    const s = heads("BB", [
      { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 220 },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 120 },
    ]);
    expect(heroChartRangeSpot(s)).toEqual({ kind: "bvb", heroCode: "K7o" });
    expect(preflopChartFact(s)).toContain("блайнд-против-блайнда");
  });

  it("за столом больше двоих K7o с BTN по-прежнему судится чартом баттона", () => {
    const s = snap({
      heroCards: ["Kh", "7d"],
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      ],
    });
    expect(heroChartRangeSpot(s)).not.toBeNull();
  });
});

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

// Аудит румов 19.07: в хедз-апе баттон — он же малый блайнд и открывает в разы шире, чем BTN в
// 6-max (~80% против ~45%). Своего чарта на хедз-ап у продукта НЕТ, поэтому судить чужой таблицей
// нельзя: и вердикт чарта, и панель обязаны молчать. Пропущенный факт мягче ложного.
describe("хедз-ап не судится чартами 6-max", () => {
  const headsUp = () =>
    snap({
      heroCards: ["Kh", "7d"],
      heroPosition: "BTN",
      seats: [
        { label: "Hero", position: "BTN", startingStack: 4000 },
        { label: "Player 1", position: "BB", startingStack: 4000 },
      ],
      preflop: [{ street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 }],
    });

  it("панель диапазонов молчит", () => {
    expect(heroChartRangeSpot(headsUp())).toBeNull();
  });

  it("вердикт префлоп-чарта тоже молчит (панель и вердикт не расходятся)", () => {
    expect(preflopChartFact(headsUp())).toBeNull();
  });

  it("за столом больше двоих K7o с BTN по-прежнему судится", () => {
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

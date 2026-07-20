/**
 * Чарт лимпа с малого блайнда (заказ Артёма 19.07: «по SB нам надо ещё лимп-колл, лимп-пасс,
 * лимп-рейз») + вердикт по ответу на рейз большого блайнда.
 *
 * Структура по решению Артёма: лимп = только слабые руки (рейз-чарт SB не трогали), поэтому
 * ловушки сильной рукой в лимп-пуле нет. Ширина лимп-колла задана его наблюдением: соперники
 * атакуют лимпы широко, в том числе мусором, поэтому туз/король/бродвей/масть защищаются.
 * ЛИМП-РЕЙЗ в чарт сознательно НЕ зашит — он ситуативный, живёт текстовой подсказкой.
 */

import { describe, it, expect } from "vitest";
import type { TableSnapshot, TableAction } from "@/parser/types";
import { sbLimpCellState } from "@/config/poker/sb-limp-chart";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import { detectHeroSbLimpFacingRaise } from "@/parser/sb-limp";
import { preflopChartFact } from "@/parser/preflop-chart-fact";

describe("sbLimpCellState — раскладка малого блайнда", () => {
  it("сильные руки открываются РЕЙЗОМ, а не лимпом (рейз-чарт главнее)", () => {
    for (const code of ["AA", "77", "22", "AKo", "A9s"]) {
      expect(sbLimpCellState(code)).toBe("RAISE_FIRST");
    }
  });

  it("высокая карта, бродвей или масть — коллируют рейз по лимпу", () => {
    for (const code of ["Q7o", "J5o", "T2o", "K3o", "A2o", "72s", "32s"]) {
      expect(sbLimpCellState(code)).toBe("LIMP_CALL");
    }
  });

  it("низ без масти и связи — на рейз сбрасываем", () => {
    for (const code of ["96o", "85o", "74o", "32o"]) {
      expect(sbLimpCellState(code)).toBe("LIMP_FOLD");
    }
  });

  it("фолда до флопа нет вовсе — с SB входим лимпом любой рукой (тактика Артёма)", () => {
    // Ни одна клетка не должна попасть в FOLD: вход стопроцентный.
    for (const code of ["32o", "72o", "92o", "42o"]) {
      expect(sbLimpCellState(code)).not.toBe("FOLD");
    }
  });

  // ⚠️Регресс: когда лимп-рейз убрали из чарта в текстовую подсказку, руки K5s-K2s остались без
  // ветки и провалились в «не входим вовсе» — при стопроцентном-то входе. Поймано проверкой сетки
  // перед выкатом на /charts. Проверяем ВСЮ сетку целиком, а не выборочные руки.
  it("ни одна из 169 клеток не проваливается в FOLD", () => {
    const fell: string[] = [];
    for (let row = 0; row < GRID_RANKS.length; row++) {
      for (let col = 0; col < GRID_RANKS.length; col++) {
        const code = cellCode(row, col);
        if (sbLimpCellState(code) === "FOLD") fell.push(code);
      }
    }
    expect(fell).toEqual([]);
  });

  it("одномастные короли — лимп-колл (король + масть)", () => {
    for (const code of ["K5s", "K4s", "K3s", "K2s"]) {
      expect(sbLimpCellState(code)).toBe("LIMP_CALL");
    }
  });
});

// Спот: лимп с SB → BB поднял → ответ Hero. Именно его судит чарт.
function limpFacingRaise(heroCards: string[], reply: TableAction["action"] | null): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: "SB", positionName: "SB", startingStack: 4000, seatNumber: 1 },
      { label: "Opp", position: "BB", positionName: "BB", startingStack: 4000, seatNumber: 2 },
      { label: "P3", position: "CO", positionName: "CO", startingStack: 4000, seatNumber: 3 },
    ],
    heroCards,
    board: [],
    potTotal: 0,
    actions: [
      { street: "PREFLOP", actor: "Hero", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Opp", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "P3", action: "FOLD" },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 50 },
      { street: "PREFLOP", actor: "Opp", action: "RAISE", amount: 400 },
      ...(reply ? [{ street: "PREFLOP" as const, actor: "Hero", action: reply, amount: 300 }] : []),
    ],
  };
}

describe("detectHeroSbLimpFacingRaise", () => {
  it("лимп → рейз BB → колл", () => {
    expect(detectHeroSbLimpFacingRaise(limpFacingRaise(["Qh", "7d"], "CALL"))).toEqual({
      code: "Q7o",
      action: "CALL",
    });
  });

  it("лимп → рейз BB → фолд", () => {
    expect(detectHeroSbLimpFacingRaise(limpFacingRaise(["7h", "4d"], "FOLD"))).toEqual({
      code: "74o",
      action: "FOLD",
    });
  });

  it("BB не поднимал — судить нечего", () => {
    const s = limpFacingRaise(["Qh", "7d"], null);
    s.actions = s.actions.filter((a) => a.action !== "RAISE");
    expect(detectHeroSbLimpFacingRaise(s)).toBeNull();
  });

  it("Hero ответил РЕЙЗОМ — это лимп-рейз, чартом сознательно не судим", () => {
    expect(detectHeroSbLimpFacingRaise(limpFacingRaise(["Kh", "5h"], "RAISE"))).toBeNull();
  });
});

describe("вердикт чарта по ответу на рейз лимпа", () => {
  const verdict = (cards: string[], reply: TableAction["action"]) =>
    preflopChartFact(limpFacingRaise(cards, reply)) ?? "";

  it("колл рукой из чарта — «в чарте», не ошибка", () => {
    expect(verdict(["Qh", "7d"], "CALL")).toContain("колл — В ЧАРТЕ");
  });

  it("колл рукой вне чарта — эталон говорит сбрасывать, но без приговора", () => {
    const v = verdict(["7h", "4d"], "CALL");
    expect(v).toContain("СБРАСЫВАЮТ");
    expect(v).toContain("ошибкой не назовёшь");
  });

  it("фолд низом без масти — по чарту верно", () => {
    expect(verdict(["7h", "4d"], "FOLD")).toContain("фолд — ПО ЧАРТУ");
  });

  it("фолд рукой из лимп-колла — тайтовее эталона", () => {
    expect(verdict(["Qh", "7d"], "FOLD")).toContain("тайтовее эталона");
  });

  it("к вердикту всегда прикреплена подсказка, что лимп-рейз НЕ эталон", () => {
    expect(verdict(["Qh", "7d"], "CALL")).toContain("Лимп-рейз в эталон НЕ входит");
  });
});

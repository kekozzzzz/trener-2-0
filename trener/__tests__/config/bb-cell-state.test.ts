/**
 * Тесты слоёв эталонного чарта защиты BB (bbCellState, config/poker/bb-defense-chart.ts,
 * plans/2026-07-03-задание-на-сессию.md Фаза 1.5).
 *
 * Главная гарантия: клетки, показанные как 3-бет (велью или блеф), детектор
 * isBBThreeBetSignificantlyWide НИКОГДА не флагает — страница и грейдер из одних
 * множеств. Обратное неверно намеренно: флагается только 3-бет вне границы+допуска,
 * а коллы/фолды 3-бетом не являются вовсе.
 */

import { describe, it, expect } from "vitest";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import {
  bbCellState,
  isBBThreeBetSignificantlyWide,
  type OpenerPosition,
} from "@/config/poker/bb-defense-chart";

const OPENERS: OpenerPosition[] = ["UTG", "MP", "HJ", "CO", "BTN"];

describe("bbCellState", () => {
  it("премиум — 3-бет на велью против любой открывашки", () => {
    for (const opener of OPENERS) {
      expect(bbCellState(opener, "AA")).toBe("THREEBET");
      expect(bbCellState(opener, "KK")).toBe("THREEBET");
      expect(bbCellState(opener, "AKo")).toBe("THREEBET");
    }
  });

  it("блок-3-беты — блеф весом (A5s), не велью", () => {
    expect(bbCellState("BTN", "A5s")).toBe("THREEBET_BLUFF");
    expect(bbCellState("UTG", "A5s")).toBe("THREEBET_BLUFF");
  });

  it("середина диапазона — колл; весовые — колл иногда; мусор — фолд", () => {
    expect(bbCellState("BTN", "KTo")).toBe("CALL");
    expect(bbCellState("UTG", "A9o")).toBe("CALL_SOMETIMES");
    expect(bbCellState("UTG", "72o")).toBe("FOLD");
  });

  it("защита шире против поздней открывашки: рука-фолд vs UTG может быть коллом vs BTN", () => {
    expect(bbCellState("UTG", "T8o")).toBe("FOLD");
    expect(bbCellState("BTN", "T8o")).toBe("CALL");
  });

  it("клетки 3-бета (велью и блеф) детектор никогда не флагает", () => {
    for (const opener of OPENERS) {
      for (let row = 0; row < GRID_RANKS.length; row++) {
        for (let col = 0; col < GRID_RANKS.length; col++) {
          const code = cellCode(row, col);
          const state = bbCellState(opener, code);
          if (state === "THREEBET" || state === "THREEBET_BLUFF") {
            expect(isBBThreeBetSignificantlyWide(opener, code)).toBe(false);
          }
        }
      }
    }
  });
});

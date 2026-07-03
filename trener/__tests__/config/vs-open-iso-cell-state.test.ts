/**
 * Тесты слоёв эталонных чартов «3-бет против опена» и «изоляция лимпера»
 * (vsOpenCellState / isoCellState, plans/2026-07-03-задание-на-сессию.md Фаза 1.5).
 *
 * Главные гарантии согласованности страницы /charts с детекторами:
 *  - vs-опен: «заметно шире» ⇔ клетка OUT (всё, что THREEBET/BLUFF/BORDER, не флагается);
 *  - изоляция: флагается ровно то, что НЕ ISO и НЕ BORDER (включая OVERLIMP-пары —
 *    изолировать мелкой парой ошибка, её слой так и подписан).
 */

import { describe, it, expect } from "vitest";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import type { OpenPosition } from "@/config/poker/rfi-chart";
import { vsOpenCellState, isVsOpenThreeBetSignificantlyWide } from "@/config/poker/vs-open-chart";
import { isoCellState, isIsoSignificantlyWide } from "@/config/poker/iso-chart";

const POSITIONS: OpenPosition[] = ["UTG", "MP", "HJ", "CO", "BTN", "SB"];

describe("vsOpenCellState", () => {
  it("премиум — 3-бет на велью с любой позиции", () => {
    for (const pos of POSITIONS) {
      expect(vsOpenCellState(pos, "AA")).toBe("THREEBET");
      expect(vsOpenCellState(pos, "AKo")).toBe("THREEBET");
    }
  });

  it("блок-блефы — весом; мусор — не 3-бетится", () => {
    expect(vsOpenCellState("BTN", "A5s")).toBe("THREEBET_BLUFF");
    expect(vsOpenCellState("UTG", "72o")).toBe("OUT");
  });

  it("страница и детектор согласованы на всех клетках всех позиций", () => {
    for (const pos of POSITIONS) {
      for (let row = 0; row < GRID_RANKS.length; row++) {
        for (let col = 0; col < GRID_RANKS.length; col++) {
          const code = cellCode(row, col);
          expect(isVsOpenThreeBetSignificantlyWide(pos, code)).toBe(
            vsOpenCellState(pos, code) === "OUT",
          );
        }
      }
    }
  });
});

describe("isoCellState", () => {
  it("мелкие пары — оверлимп, и изоляция ими флагается детектором", () => {
    for (const pos of POSITIONS) {
      expect(isoCellState(pos, "22")).toBe("OVERLIMP");
      expect(isIsoSignificantlyWide(pos, "22")).toBe(true);
    }
  });

  it("сильные руки — изоляция; мусор — фолд", () => {
    expect(isoCellState("BTN", "AKs")).toBe("ISO");
    expect(isoCellState("UTG", "72o")).toBe("OUT");
  });

  it("страница и детектор согласованы на всех клетках всех позиций", () => {
    for (const pos of POSITIONS) {
      for (let row = 0; row < GRID_RANKS.length; row++) {
        for (let col = 0; col < GRID_RANKS.length; col++) {
          const code = cellCode(row, col);
          const state = isoCellState(pos, code);
          expect(isIsoSignificantlyWide(pos, code)).toBe(state === "OUT" || state === "OVERLIMP");
        }
      }
    }
  });
});

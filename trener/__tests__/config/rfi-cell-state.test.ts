/**
 * Тесты слоёв эталонного чарта (rfiCellState, config/poker/rfi-chart.ts,
 * plans/2026-07-03-задание-на-сессию.md Фаза 1.5).
 *
 * Главная гарантия: страница чартов и детектор isOpenSignificantlyWide считают из
 * одних множеств и НЕ могут разойтись — «заметно шире» это ровно OUT, всё остальное
 * детектор не флагает.
 */

import { describe, it, expect } from "vitest";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import {
  rfiCellState,
  isOpenSignificantlyWide,
  type OpenPosition,
} from "@/config/poker/rfi-chart";

const POSITIONS: OpenPosition[] = ["UTG", "MP", "HJ", "CO", "BTN", "SB"];

describe("rfiCellState", () => {
  it("ядро: премиум всегда ALWAYS с любой позиции", () => {
    for (const pos of POSITIONS) {
      expect(rfiCellState(pos, "AA")).toBe("ALWAYS");
      expect(rfiCellState(pos, "AKs")).toBe("ALWAYS");
      expect(rfiCellState(pos, "AKo")).toBe("ALWAYS");
    }
  });

  it("весовые руки — SOMETIMES (внутри диапазона, но «иногда»)", () => {
    expect(rfiCellState("UTG", "22")).toBe("SOMETIMES");
    expect(rfiCellState("UTG", "K6s")).toBe("SOMETIMES");
    expect(rfiCellState("BTN", "98o")).toBe("SOMETIMES");
  });

  it("граница допуска — BORDER (на шаг ниже края диапазона)", () => {
    // UTG: K6s — край (весовой), K5s — шаг ниже → граница.
    expect(rfiCellState("UTG", "K5s")).toBe("BORDER");
    // UTG: ATo — край офсьюта, A9o — шаг ниже → граница.
    expect(rfiCellState("UTG", "A9o")).toBe("BORDER");
  });

  it("мусор — OUT с любой позиции", () => {
    for (const pos of POSITIONS) {
      expect(rfiCellState(pos, "72o")).toBe("OUT");
      expect(rfiCellState(pos, "Q2o")).toBe("OUT");
    }
  });

  it("страница и детектор согласованы на всех 169 клетках всех позиций", () => {
    for (const pos of POSITIONS) {
      for (let row = 0; row < GRID_RANKS.length; row++) {
        for (let col = 0; col < GRID_RANKS.length; col++) {
          const code = cellCode(row, col);
          const wide = isOpenSignificantlyWide(pos, code);
          const state = rfiCellState(pos, code);
          // Детектор флагает ровно то, что на странице OUT — и ничего больше.
          expect(wide).toBe(state === "OUT");
        }
      }
    }
  });
});

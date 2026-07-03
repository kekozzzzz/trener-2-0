/**
 * Тесты слоёв эталонного пуш-чарта (pushCellState, config/poker/push-fold-chart.ts,
 * plans/2026-07-03-задание-на-сессию.md Фаза 1.5).
 *
 * Главная гарантия: страница /charts и детектор isOpenShoveSignificantlyWide считают
 * из одних множеств — «заметно шире» это ровно OUT (фолд), всё остальное не флагается.
 */

import { describe, it, expect } from "vitest";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import {
  pushCellState,
  isOpenShoveSignificantlyWide,
  type PushPosition,
  type StackBand,
} from "@/config/poker/push-fold-chart";

const POSITIONS: PushPosition[] = ["UTG", "MP2", "CO", "BTN", "SB"];
const BANDS: StackBand[] = ["SHORT", "MID"];

describe("pushCellState", () => {
  it("премиум — пуш с любой позиции на любом бэнде", () => {
    for (const band of BANDS) {
      for (const pos of POSITIONS) {
        expect(pushCellState(band, pos, "AA")).toBe("ALWAYS");
        expect(pushCellState(band, pos, "AKs")).toBe("ALWAYS");
      }
    }
  });

  it("короткий стек шире среднего: рука-пуш на SHORT может быть фолдом на MID", () => {
    // UTG SHORT: 55+ пуш; UTG MID: 66+ → 55 на MID уже не пуш (граница допуска).
    expect(pushCellState("SHORT", "UTG", "55")).toBe("ALWAYS");
    expect(pushCellState("MID", "UTG", "55")).not.toBe("ALWAYS");
  });

  it("мусор — фолд (OUT) с ранней позиции", () => {
    expect(pushCellState("SHORT", "UTG", "72o")).toBe("OUT");
    expect(pushCellState("MID", "UTG", "T4s")).toBe("OUT");
  });

  it("страница и детектор согласованы на всех клетках, позициях и бэндах", () => {
    for (const band of BANDS) {
      for (const pos of POSITIONS) {
        for (let row = 0; row < GRID_RANKS.length; row++) {
          for (let col = 0; col < GRID_RANKS.length; col++) {
            const code = cellCode(row, col);
            const wide = isOpenShoveSignificantlyWide(band, pos, code);
            const state = pushCellState(band, pos, code);
            expect(wide).toBe(state === "OUT");
          }
        }
      }
    }
  });
});

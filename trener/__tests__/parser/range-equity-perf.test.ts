import { describe, it, expect } from "vitest";
import { equityVsRange } from "@/parser/range-equity";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";

// Страховка от деградации: худший случай движка — ВСЯ сетка (169 кодов) на флопе,
// ~1,1 млн сравнений. Должен оставаться в разумных секундах, иначе шаг воркера
// задержит следующий вопрос диалога заметно для игрока.

function allGridCodes(): string[] {
  const codes: string[] = [];
  for (let r = 0; r < GRID_RANKS.length; r++)
    for (let c = 0; c < GRID_RANKS.length; c++) codes.push(cellCode(r, c));
  return [...new Set(codes)];
}

describe("equityVsRange — производительность худшего случая", () => {
  it("вся сетка на флопе считается за вменяемое время", () => {
    const start = performance.now();
    const r = equityVsRange(["Ah", "5h"], ["Kh", "8h", "2c"], allGridCodes());
    const ms = performance.now() - start;

    expect(r).not.toBeNull();
    expect(r!.combosLive).toBeGreaterThan(1000);
    // Порог с запасом: на дев-машине ~секунды; провал теста = движок деградировал.
    expect(ms).toBeLessThan(15_000);
  }, 30_000);
});

import { describe, it, expect } from "vitest";
import { renderChartEquityFacts } from "@/parser/chart-equity-fact";
import type { TableSnapshot } from "@/parser/types";

function snap(partial: Partial<TableSnapshot>): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions: [], potTotal: 0, ...partial };
}

// Достаём число процентов из строки «≈X%» (первое вхождение) — для проверки диапазона.
function firstPct(line: string): number {
  const m = line.match(/≈(\d+)%/);
  return m ? Number(m[1]) : NaN;
}

describe("chart-equity-fact — фаза 1: эквити против чартового диапазона", () => {
  it("колл против опен-олл-ина: эквити ATo против широкого пуша CO ≤10 BB + цена колла", () => {
    // Hero (BB) коллирует опен-олл-ин HJ на 9 BB. HJ→CO в пуш-чарте, стек SHORT (широко).
    const s = snap({
      seats: [
        { label: "Hero", position: "BB", startingStack: 1000 },
        { label: "Player 3", position: "HJ", startingStack: 180 }, // 9 BB → SHORT
        { label: "Player 1", position: "SB", startingStack: 800 },
      ],
      heroCards: ["Ah", "Td"], // ATo
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Player 3", action: "ALL_IN", amount: 180 },
        { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 160 },
      ],
    });
    // Цена колла пот-оддс: 160 / (210 + 160) = 43%.
    const lines = renderChartEquityFacts(s, 43);
    const line = lines.find((l) => l.includes("против пуш-диапазона"));
    expect(line).toBeTruthy();
    const eq = firstPct(line!);
    expect(eq).toBeGreaterThanOrEqual(45);
    expect(eq).toBeLessThanOrEqual(62);
    expect(line).toContain("цены колла ≈43%");
  });

  it("рестил: эквити A5s при колле + фолд-эквити по чартам (обе половины пуша)", () => {
    // Hero (BTN, 20 BB) 3-бет-олл-ин поверх опена CO (поздняя позиция).
    const s = snap({
      seats: [
        { label: "Hero", position: "BTN", startingStack: 400 }, // 20 BB → HIGH
        { label: "Player 4", position: "CO", startingStack: 1200 },
        { label: "Player 1", position: "SB", startingStack: 900 },
        { label: "Player 2", position: "BB", startingStack: 900 },
      ],
      heroCards: ["Ah", "5h"], // A5s
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Player 4", action: "RAISE", amount: 50 },
        { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 400 },
        { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 4", action: "FOLD" },
      ],
    });
    const lines = renderChartEquityFacts(s, null);
    const callLine = lines.find((l) => l.includes("ПРИ КОЛЛЕ твоего рестила"));
    const foldLine = lines.find((l) => l.includes("Фолд-эквити рестила"));
    expect(callLine).toBeTruthy();
    expect(foldLine).toBeTruthy();
    // A5s против велью-диапазона колла опенера — позади, но не мусор.
    const eqCall = firstPct(callLine!);
    expect(eqCall).toBeGreaterThanOrEqual(28);
    expect(eqCall).toBeLessThanOrEqual(48);
    // Опенер сбрасывает заметную долю опен-диапазона на олл-ин.
    const foldPct = Number(foldLine!.match(/сбрасывает ≈(\d+)%/)?.[1]);
    expect(foldPct).toBeGreaterThanOrEqual(40);
    expect(foldPct).toBeLessThanOrEqual(85);
  });

  it("защита BB: эквити QJs против опен-диапазона BTN — впереди/около", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BB", startingStack: 1000 }, // 50 BB
        { label: "Player 5", position: "BTN", startingStack: 1000 },
        { label: "Player 1", position: "SB", startingStack: 1000 },
      ],
      heroCards: ["Qh", "Jh"], // QJs
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Player 5", action: "RAISE", amount: 50 },
        { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 30 },
      ],
    });
    const lines = renderChartEquityFacts(s, null);
    const line = lines.find((l) => l.includes("против всего опен-диапазона BTN"));
    expect(line).toBeTruthy();
    const eq = firstPct(line!);
    expect(eq).toBeGreaterThanOrEqual(45);
    expect(eq).toBeLessThanOrEqual(65);
  });

  it("нет чартового спота → пусто", () => {
    const s = snap({
      seats: [{ label: "Hero", position: "BTN", startingStack: 1000 }],
      heroCards: ["Ah", "Kh"],
      actions: [{ street: "PREFLOP", actor: "Hero", action: "FOLD" }],
    });
    expect(renderChartEquityFacts(s, null)).toEqual([]);
  });
});

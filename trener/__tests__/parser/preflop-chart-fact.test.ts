import { describe, it, expect } from "vitest";
import { preflopChartFact } from "@/parser/preflop-chart-fact";
import type { Position, TableSnapshot } from "@/parser/types";

// Вердикт эталонного префлоп-чарта для промпта: те же детекторы и грейдеры, что
// /charts. Родился из правок Артёма 2026-07-05: тренер называл ошибкой стандартную
// защиту BB (QJo против BTN, 64s против CO) — теперь вердикт чарта в фактах.

function snap(partial: Partial<TableSnapshot>): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions: [], potTotal: 0, ...partial };
}

// Hero на BB защищается против одиночного опена (блайнды 10/20, стеки 100bb).
function bbDefenseSnap(heroCards: string[], openerPos: Position, heroAction: "CALL" | "RAISE" | "FOLD"): TableSnapshot {
  return snap({
    seats: [
      { label: "Hero", position: "BB", startingStack: 2000 },
      { label: "Player 1", position: openerPos, startingStack: 2000 },
      { label: "Player 2", position: "SB", startingStack: 2000 },
    ],
    heroCards,
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 10 },
      { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 20 },
      { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 40 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Hero", action: heroAction, amount: heroAction === "CALL" ? 20 : heroAction === "RAISE" ? 120 : undefined },
    ],
  });
}

describe("preflopChartFact — защита BB", () => {
  it("QJo против опена BTN: колл — стандартная защита, не ошибка", () => {
    const fact = preflopChartFact(bbDefenseSnap(["Qs", "Jd"], "BTN", "CALL"));
    expect(fact).toContain("СТАНДАРТНАЯ защита");
    expect(fact).toContain("QJo");
    expect(fact).toContain("не называй ошибкой");
  });

  it("64s против опена CO: колл в чарте", () => {
    const fact = preflopChartFact(bbDefenseSnap(["6s", "4s"], "CO", "CALL"));
    expect(fact).toContain("СТАНДАРТНАЯ защита");
  });

  it("72o против опена с ранней (UTG): руки в чарте защиты нет", () => {
    const s = bbDefenseSnap(["7s", "2d"], "EARLY", "CALL");
    s.seats[1].positionName = "UTG"; // ранние в снимке: coarse EARLY + точное имя
    const fact = preflopChartFact(s);
    expect(fact).toContain("нет");
    expect(fact).toContain("фолд");
  });

  it("фолд руки, которая по чарту защищается, — подсказываем эталон", () => {
    const fact = preflopChartFact(bbDefenseSnap(["Qs", "Jd"], "BTN", "FOLD"));
    expect(fact).toContain("ЗАЩИЩАЕТСЯ коллом");
  });

  it("3-бет мусором — заметно шире нормы чарта", () => {
    const fact = preflopChartFact(bbDefenseSnap(["7s", "2d"], "BTN", "RAISE"));
    expect(fact).toContain("ШИРЕ нормы");
  });
});

describe("preflopChartFact — не наш спот", () => {
  it("3-бет до Hero → null (в сомнении не судим)", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BB", startingStack: 2000 },
        { label: "Player 1", position: "BTN", startingStack: 2000 },
        { label: "Player 2", position: "SB", startingStack: 2000 },
      ],
      heroCards: ["Qs", "Jd"],
      actions: [
        { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 40 },
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 140 },
        { street: "PREFLOP", actor: "Hero", action: "FOLD" },
      ],
    });
    expect(preflopChartFact(s)).toBeNull();
  });
});

describe("preflopChartFact — открытие (RFI)", () => {
  it("открытие AKo с BTN — в чарте", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BTN", startingStack: 2000 },
        { label: "Player 1", position: "SB", startingStack: 2000 },
        { label: "Player 2", position: "BB", startingStack: 2000 },
      ],
      heroCards: ["As", "Kd"],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 45 },
        { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      ],
    });
    const fact = preflopChartFact(s);
    expect(fact).toContain("стандартное открытие");
  });
});

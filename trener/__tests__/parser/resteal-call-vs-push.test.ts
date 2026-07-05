/**
 * Тесты рестила и колла против пуша (plans: аудит 2026-07-05 → чарты из публичных
 * равновесий): детекторы + вердикт эталона в preflop-chart-fact. Кейсы — ровно те,
 * где тренер в аудите ошибался: A2s 14bb SB vs BTN-опен, 55 vs пуш BTN 12.6bb.
 */

import { describe, it, expect } from "vitest";
import type { Position, TableSnapshot } from "@/parser/types";
import { detectHeroResteal } from "@/parser/resteal";
import { detectHeroCallVsPush } from "@/parser/call-vs-push";
import { preflopChartFact } from "@/parser/preflop-chart-fact";

function snap(partial: Partial<TableSnapshot>): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions: [], potTotal: 0, ...partial };
}

// Hero SB (стек в BB задаётся) отвечает олл-ином на опен 2bb (блайнды 100/200).
function restealSnap(heroCards: string[], heroStackBb: number, openerPos: Position): TableSnapshot {
  const stack = heroStackBb * 200;
  return snap({
    seats: [
      { label: "Hero", position: "SB", startingStack: stack },
      { label: "Player 1", position: openerPos, startingStack: 12000 },
      { label: "Player 2", position: "BB", startingStack: 9000 },
    ],
    heroCards,
    actions: [
      { street: "PREFLOP", actor: "Hero", action: "POST_SB", amount: 100 },
      { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 200 },
      { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 400 },
      { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: stack },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: stack - 400 },
    ],
  });
}

describe("detectHeroResteal + вердикт чарта", () => {
  it("A2s 14.5bb против опена BTN — весовая клетка, не ошибка (кейс аудита)", () => {
    const s = restealSnap(["As", "2s"], 14.5, "BTN");
    const rs = detectHeroResteal(s);
    expect(rs).toEqual({ openerGroup: "LATE", band: "HIGH", code: "A2s" });
    const fact = preflopChartFact(s);
    expect(fact).toContain("рестил");
    expect(fact).toContain("не считается");
  });

  it("AJo 15bb против опена CO — ядро чарта, стандартный рестил", () => {
    const fact = preflopChartFact(restealSnap(["Ah", "Jd"], 15, "CO"));
    expect(fact).toContain("СТАНДАРТНЫЙ рестил");
  });

  it("72o джем — вне чарта", () => {
    const fact = preflopChartFact(restealSnap(["7h", "2d"], 15, "BTN"));
    expect(fact).toContain("ВНЕ чарта рестила");
  });

  it("глубокий стек (25bb) — не рестил-спот", () => {
    expect(detectHeroResteal(restealSnap(["As", "2s"], 25, "BTN"))).toBeNull();
  });

  it("коллер между опеном и Hero — сквиз, не судим", () => {
    const s = restealSnap(["As", "2s"], 14.5, "CO");
    s.actions.splice(3, 0, { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 400 });
    expect(detectHeroResteal(s)).toBeNull();
  });
});

// Hero SB против опен-олл-ина первого вошедшего (блайнды 100/200).
function callVsPushSnap(
  heroCards: string[],
  pusherStackBb: number,
  pusherPos: Position,
  heroAction: "CALL" | "ALL_IN" | "FOLD",
): TableSnapshot {
  const pusherStack = pusherStackBb * 200;
  return snap({
    seats: [
      { label: "Hero", position: "SB", startingStack: 6000 },
      { label: "Player 1", position: pusherPos, startingStack: pusherStack },
      { label: "Player 2", position: "BB", startingStack: 9000 },
    ],
    heroCards,
    actions: [
      { street: "PREFLOP", actor: "Hero", action: "POST_SB", amount: 100 },
      { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 200 },
      { street: "PREFLOP", actor: "Player 1", action: "ALL_IN", amount: pusherStack },
      { street: "PREFLOP", actor: "Hero", action: heroAction, amount: heroAction === "FOLD" ? undefined : 6000 },
    ],
  });
}

describe("detectHeroCallVsPush + вердикт чарта", () => {
  it("55 против пуша BTN 12.6bb — стандартный колл (кейс аудита)", () => {
    const s = callVsPushSnap(["5s", "5d"], 12.6, "BTN", "ALL_IN");
    const d = detectHeroCallVsPush(s);
    expect(d).toEqual({ pusherGroup: "LATE", pusherBand: "MID", code: "55", action: "CALL" });
    const fact = preflopChartFact(s);
    expect(fact).toContain("СТАНДАРТНЫЙ колл");
  });

  it("A9o против пуша ранней позиции 12bb — вне чарта, по эталону фолд", () => {
    const s = callVsPushSnap(["Ah", "9d"], 12, "EARLY", "CALL");
    s.seats[1].positionName = "UTG";
    const fact = preflopChartFact(s);
    expect(fact).toContain("ВНЕ чарта");
  });

  it("фолд руки из чарта — подсказка «тайтовее эталона», без клейма", () => {
    const fact = preflopChartFact(callVsPushSnap(["Ah", "Qd"], 8, "BTN", "FOLD"));
    expect(fact).toContain("тайтовее эталона");
  });

  it("пушер ≥15bb — не пуш-фолд спот", () => {
    expect(detectHeroCallVsPush(callVsPushSnap(["5s", "5d"], 18, "BTN", "CALL"))).toBeNull();
  });
});

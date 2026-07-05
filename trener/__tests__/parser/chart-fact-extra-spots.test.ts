/**
 * Вердикты чартов для доборных спотов (2026-07-05 «что мы забыли»): защита против
 * 3-бета (4-бет), сквиз, SB-лимп, блайнд-против-блайнда — все через preflop-chart-fact.
 */

import { describe, it, expect } from "vitest";
import type { Position, TableSnapshot } from "@/parser/types";
import { preflopChartFact } from "@/parser/preflop-chart-fact";
import { detectHeroBvbDefense } from "@/parser/bvb-defense";

function snap(partial: Partial<TableSnapshot>): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions: [], potTotal: 0, ...partial };
}

// Hero открылся с позиции, в него 3-бетнули, Hero отвечает (блайнды 50/100, стеки 40bb).
function defVs3betSnap(heroCards: string[], heroPos: Position, heroAction: "RAISE" | "CALL" | "FOLD"): TableSnapshot {
  return snap({
    seats: [
      { label: "Hero", position: heroPos, startingStack: 4000 },
      { label: "Player 1", position: "BTN", startingStack: 4000 },
      { label: "Player 2", position: "SB", startingStack: 4000 },
      { label: "Player 3", position: "BB", startingStack: 4000 },
    ],
    heroCards,
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Player 3", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 200 },
      { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 650 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
      { street: "PREFLOP", actor: "Hero", action: heroAction, amount: heroAction === "RAISE" ? 1600 : heroAction === "CALL" ? 450 : undefined },
    ],
  });
}

describe("защита против 3-бета", () => {
  it("4-бет AKo — велью по чарту", () => {
    const fact = preflopChartFact(defVs3betSnap(["As", "Kd"], "CO", "RAISE"));
    expect(fact).toContain("4-бет на велью");
  });

  it("4-бет A5s — блокер весом", () => {
    const fact = preflopChartFact(defVs3betSnap(["As", "5s"], "CO", "RAISE"));
    expect(fact).toContain("блеф-часть чарта");
  });

  it("4-бет мусором — вне чарта", () => {
    const fact = preflopChartFact(defVs3betSnap(["8s", "3d"], "CO", "RAISE"));
    expect(fact).toContain("ВНЕ чарта");
  });

  it("колл 3-бета — не судится, отсылка к глубине", () => {
    const fact = preflopChartFact(defVs3betSnap(["7s", "7d"], "CO", "CALL"));
    expect(fact).toContain("НЕ судится");
    expect(fact).toContain("ГЛУБИНУ");
  });
});

describe("сквиз и SB-лимп", () => {
  it("сквиз мусором — заведомо вне", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BTN", startingStack: 4000 },
        { label: "Player 1", position: "HJ", startingStack: 4000 },
        { label: "Player 2", position: "CO", startingStack: 4000 },
        { label: "Player 3", position: "SB", startingStack: 4000 },
        { label: "Player 4", position: "BB", startingStack: 4000 },
      ],
      heroCards: ["Jc", "4d"],
      actions: [
        { street: "PREFLOP", actor: "Player 3", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Player 4", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 200 },
        { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 200 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 900 },
      ],
    });
    const fact = preflopChartFact(s);
    expect(fact).toContain("мусорная рука для сквиза");
  });

  it("SB-лимп — не утечка по эталону", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "SB", startingStack: 4000 },
        { label: "Player 1", position: "BB", startingStack: 4000 },
        { label: "Player 2", position: "BTN", startingStack: 4000 },
      ],
      heroCards: ["9c", "6d"],
      actions: [
        { street: "PREFLOP", actor: "Hero", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Player 1", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 50 },
        { street: "PREFLOP", actor: "Player 1", action: "CHECK" },
      ],
    });
    const fact = preflopChartFact(s);
    expect(fact).toContain("НЕ утечка");
  });
});

// BvB: фолд до SB, SB рейзит, Hero на BB отвечает (блайнды 50/100, стеки 40bb).
function bvbSnap(heroCards: string[], heroAction: "CALL" | "RAISE" | "FOLD"): TableSnapshot {
  return snap({
    seats: [
      { label: "Hero", position: "BB", startingStack: 4000 },
      { label: "Player 1", position: "SB", startingStack: 4000 },
      { label: "Player 2", position: "BTN", startingStack: 4000 },
    ],
    heroCards,
    actions: [
      { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 300 },
      { street: "PREFLOP", actor: "Hero", action: heroAction, amount: heroAction === "FOLD" ? undefined : heroAction === "CALL" ? 200 : 900 },
    ],
  });
}

// Hero открылся с CO, в него 3-бет-олл-ин 15bb с BTN, Hero отвечает.
function callVsRestealSnap(heroCards: string[], heroAction: "CALL" | "FOLD"): TableSnapshot {
  return snap({
    seats: [
      { label: "Hero", position: "CO", startingStack: 8000 },
      { label: "Player 1", position: "BTN", startingStack: 1500 },
      { label: "Player 2", position: "SB", startingStack: 4000 },
      { label: "Player 3", position: "BB", startingStack: 4000 },
    ],
    heroCards,
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Player 3", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 200 },
      { street: "PREFLOP", actor: "Player 1", action: "ALL_IN", amount: 1500 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
      { street: "PREFLOP", actor: "Hero", action: heroAction, amount: heroAction === "CALL" ? 1300 : undefined },
    ],
  });
}

describe("колл против рестила и лимпы", () => {
  it("AQo коллирует джем 15bb после опена с CO — в чарте", () => {
    const fact = preflopChartFact(callVsRestealSnap(["Ah", "Qd"], "CALL"));
    expect(fact).toContain("стандартный колл");
  });

  it("A5o коллирует джем — вне чарта, опен-и-фолд нормален", () => {
    const fact = preflopChartFact(callVsRestealSnap(["Ah", "5d"], "CALL"));
    expect(fact).toContain("ВНЕ чарта");
  });

  it("фолд AJo на джем — тайтовее эталона (подсказка, не клеймо)", () => {
    const fact = preflopChartFact(callVsRestealSnap(["Ah", "Jd"], "FOLD"));
    expect(fact).toContain("тайтовее эталона");
  });

  it("открытие лимпом — утечка по эталону", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "HJ", startingStack: 8000 },
        { label: "Player 1", position: "SB", startingStack: 4000 },
        { label: "Player 2", position: "BB", startingStack: 4000 },
      ],
      heroCards: ["Kh", "9d"],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 100 },
        { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 2", action: "CHECK" },
      ],
    });
    expect(preflopChartFact(s)).toContain("утечка");
  });

  it("оверлимп мелкой парой — не ошибка", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BTN", startingStack: 8000 },
        { label: "Player 1", position: "HJ", startingStack: 4000 },
        { label: "Player 2", position: "SB", startingStack: 4000 },
        { label: "Player 3", position: "BB", startingStack: 4000 },
      ],
      heroCards: ["3h", "3d"],
      actions: [
        { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Player 3", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 100 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 100 },
      ],
    });
    expect(preflopChartFact(s)).toContain("сет-майнинг");
  });
});

describe("блайнд-против-блайнда", () => {
  it("колл T7o против SB-опена — стандартная защита", () => {
    const d = detectHeroBvbDefense(bvbSnap(["Th", "7d"], "CALL"));
    expect(d).toEqual({ code: "T7o", action: "CALL" });
    const fact = preflopChartFact(bvbSnap(["Th", "7d"], "CALL"));
    expect(fact).toContain("СТАНДАРТНАЯ защита");
  });

  it("3-бет A5o — блеф-часть чарта", () => {
    const fact = preflopChartFact(bvbSnap(["Ah", "5d"], "RAISE"));
    expect(fact).toContain("блеф-часть чарта");
  });

  it("фолд K9o против SB-опена — тайтовее эталона", () => {
    const fact = preflopChartFact(bvbSnap(["Kh", "9d"], "FOLD"));
    expect(fact).toContain("тайтовее эталона");
  });

  it("совсем мусор (72o) коллом — вне даже BvB-защиты", () => {
    const fact = preflopChartFact(bvbSnap(["7h", "2d"], "CALL"));
    expect(fact).toContain("дефолт фолд");
  });
});

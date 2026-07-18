/**
 * Форсированный префлоп-олл-ин премиум-рукой (parser/forced-preflop-allin.ts, Артём 18.07):
 * AK/тузы, всё зашло на префлопе, постфлоп-решений нет — «что бы ни случилось, я выставляюсь».
 * Разбирать нечего → уходит в COOLER, не в «Стоит обсудить». Постфлоп теми же руками (рейзы на
 * тёрне/ривере, где надо было сдаться) — ОСТАЁТСЯ в разборе.
 */

import { describe, it, expect } from "vitest";
import type { ParsedHandSnapshot, TableSnapshot } from "@/parser/types";
import { isForcedPreflopAllIn } from "@/parser/forced-preflop-allin";
import { assignImportanceLevels } from "@/parser/ggpoker/classify";

// Hero BB (31 BB) коллит опен-олл-ин 20 BB с CO — ровно раздача, которую поймал Артём.
function preflopAllInSnap(overrides?: {
  heroCards?: string[];
  postflop?: boolean;
}): TableSnapshot {
  const base: TableSnapshot = {
    seats: [
      { label: "Villain", position: "CO", startingStack: 2000, seatNumber: 4, shownCards: ["Qh", "Qd"] },
      { label: "Hero", position: "BB", startingStack: 3100, seatNumber: 1 },
    ],
    heroCards: overrides?.heroCards ?? ["Ah", "Ks"], // AKo
    board: ["Qc", "7d", "2h", "3s", "9c"], // Hero проиграл сету/паре дам
    actions: [
      { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Villain", action: "ALL_IN", amount: 2000 },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 1900 },
    ],
    potTotal: 4000,
  };
  if (overrides?.postflop) {
    // Тот же AK, но деньги зашли ПОСТФЛОПОМ: колл олл-ина на тёрне — есть что разбирать.
    base.actions = [
      { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Villain", action: "RAISE", amount: 250 },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 150 },
      { street: "FLOP", actor: "Hero", action: "CHECK" },
      { street: "FLOP", actor: "Villain", action: "BET", amount: 300 },
      { street: "FLOP", actor: "Hero", action: "CALL", amount: 300 },
      { street: "TURN", actor: "Villain", action: "ALL_IN", amount: 2550 },
      { street: "TURN", actor: "Hero", action: "CALL", amount: 2550 },
    ];
  }
  return base;
}

describe("isForcedPreflopAllIn", () => {
  it("AKo коллом опен-олл-ина на префлопе — форс (нечего разбирать)", () => {
    expect(isForcedPreflopAllIn(preflopAllInSnap())).toBe(true);
  });

  it("тузы префлоп-олл-ином — форс", () => {
    expect(isForcedPreflopAllIn(preflopAllInSnap({ heroCards: ["As", "Ad"] }))).toBe(true);
  });

  it("те же тузы, но деньги зашли ПОСТФЛОПОМ (колл олл-ина на тёрне) — НЕ форс, разбираем", () => {
    expect(isForcedPreflopAllIn(preflopAllInSnap({ heroCards: ["As", "Ad"], postflop: true }))).toBe(false);
  });

  it("A9o — не премиум, префлоп-олл-ин остаётся кандидатом в разбор (возможный лик)", () => {
    expect(isForcedPreflopAllIn(preflopAllInSnap({ heroCards: ["Ah", "9s"] }))).toBe(false);
  });

  it("99 — ниже порога TT+, не отсекаем", () => {
    expect(isForcedPreflopAllIn(preflopAllInSnap({ heroCards: ["9s", "9d"] }))).toBe(false);
  });
});

describe("assignImportanceLevels — форс-олл-ин не идёт в критические", () => {
  const parsed = (snapshot: TableSnapshot, chipResult: number): ParsedHandSnapshot => ({
    chipResult,
    tableSnapshot: snapshot,
  });

  it("проигранный AKo-колл олл-ина на префлопе → COOLER, а не CRITICAL", () => {
    const levels = assignImportanceLevels([parsed(preflopAllInSnap(), -2000)]);
    expect(levels[0]).toBe("COOLER");
  });

  it("тот же AK, но проигран ПОСТФЛОПОМ → остаётся в разборе (CRITICAL)", () => {
    const levels = assignImportanceLevels([parsed(preflopAllInSnap({ postflop: true }), -3200)]);
    expect(levels[0]).toBe("CRITICAL");
  });

  it("A9o префлоп-олл-ин проигран → НЕ прячем (CRITICAL)", () => {
    const levels = assignImportanceLevels([parsed(preflopAllInSnap({ heroCards: ["Ah", "9s"] }), -2000)]);
    expect(levels[0]).toBe("CRITICAL");
  });
});

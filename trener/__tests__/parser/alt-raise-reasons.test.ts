import { describe, it, expect } from "vitest";
import type { Street, TableAction, TableSnapshot } from "@/parser/types";
import { alternativeRaises } from "@/parser/alternatives";

const P = (street: Street, actor: string, action: TableAction["action"], amount?: number): TableAction =>
  ({ street, actor, action, amount });

// HU: Hero(BB) чек, Player1 бет villainBet, Hero колл. Банк флопа = 200.
function facing(heroCards: string[], board: string[], villainBet: number): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: "BB", positionName: "BB", startingStack: 5000, seatNumber: 1 },
      { label: "Player 1", position: "BTN", positionName: "BTN", startingStack: 5000, seatNumber: 2 },
    ],
    heroCards,
    board,
    tableSize: 2,
    buttonSeat: 2,
    potTotal: 0,
    actions: [
      P("PREFLOP", "Player 1", "POST_SB", 50),
      P("PREFLOP", "Hero", "POST_BB", 100),
      P("PREFLOP", "Player 1", "CALL", 50),
      P("PREFLOP", "Hero", "CHECK"),
      P("FLOP", "Hero", "CHECK"),
      P("FLOP", "Player 1", "BET", villainBet),
      P("FLOP", "Hero", "CALL", villainBet),
    ],
  };
}

describe("alternativeRaises — доп-причины", () => {
  it("сет против ставки → VALUE_RAISE", () => {
    const r = alternativeRaises(facing(["9c", "9d"], ["Ks", "9s", "3h"], 130));
    expect(r).toHaveLength(1);
    expect(r[0].reason).toBe("VALUE_RAISE");
    expect(r[0].madeHand).toContain("сет");
  });

  it("топ-пара на дровяной доске против ставки → VALUE_RAISE", () => {
    const r = alternativeRaises(facing(["Ad", "Kc"], ["Ks", "9s", "3h"], 130));
    expect(r).toHaveLength(1);
    expect(r[0].reason).toBe("VALUE_RAISE");
  });

  it("вторая пара против МЕЛКОЙ ставки (<33%) → CHEAP_RAISE", () => {
    const r = alternativeRaises(facing(["Ad", "9h"], ["Kc", "9s", "3d"], 40));
    expect(r).toHaveLength(1);
    expect(r[0].reason).toBe("CHEAP_RAISE");
  });

  it("чистый воздух против мелкой ставки → молчим (не 0-в-0)", () => {
    expect(alternativeRaises(facing(["Qd", "4c"], ["Kc", "9s", "3d"], 40))).toHaveLength(0);
  });

  it("флеш-дро против ставки → всё ещё SEMI_BLUFF_DRAW", () => {
    const r = alternativeRaises(facing(["As", "5s"], ["Ks", "9s", "3h"], 130));
    expect(r).toHaveLength(1);
    expect(r[0].reason).toBe("SEMI_BLUFF_DRAW");
  });
});

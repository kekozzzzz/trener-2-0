import { describe, it, expect } from "vitest";
import type { Street, TableAction, TableSnapshot } from "@/parser/types";
import { facingRaiseAlternatives } from "@/parser/alternatives";

const P = (street: Street, actor: string, action: TableAction["action"], amount?: number): TableAction =>
  ({ street, actor, action, amount });

// HU. Префлоп до флопа, флоп чек-чек, тёрн: Hero бет 150 → Player1 рейз 450 → Hero колл.
function turnRaise(heroCards: string[], board: string[]): TableSnapshot {
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
      P("FLOP", "Player 1", "CHECK"),
      P("TURN", "Hero", "BET", 150),
      P("TURN", "Player 1", "RAISE", 450),
      P("TURN", "Hero", "CALL", 300),
    ],
  };
}

describe("facingRaiseAlternatives — геройский колл чек-рейза", () => {
  it("слабая пара заколлировала рейз тёрна → упущенный ФОЛД", () => {
    const r = facingRaiseAlternatives(turnRaise(["Ad", "9h"], ["Kc", "9s", "3d", "7h"]));
    expect(r).toHaveLength(1);
    expect(r[0].street).toBe("TURN");
    expect(r[0].equityToCallPct).toBeGreaterThan(0);
  });

  it("сет заколлировал рейз → колл нормален, молчим", () => {
    expect(facingRaiseAlternatives(turnRaise(["9c", "9d"], ["Kc", "9s", "3d", "7h"]))).toHaveLength(0);
  });

  it("флеш-дро заколлировало рейз → живое дро, молчим", () => {
    expect(facingRaiseAlternatives(turnRaise(["As", "5s"], ["Ks", "9s", "3d", "7h"]))).toHaveLength(0);
  });

  it("чек-рейз на ФЛОПЕ (не тёрн/ривер) → не флагаем", () => {
    const s: TableSnapshot = {
      seats: [
        { label: "Hero", position: "BB", positionName: "BB", startingStack: 5000, seatNumber: 1 },
        { label: "Player 1", position: "BTN", positionName: "BTN", startingStack: 5000, seatNumber: 2 },
      ],
      heroCards: ["Ad", "9h"],
      board: ["Kc", "9s", "3d"],
      tableSize: 2,
      buttonSeat: 2,
      potTotal: 0,
      actions: [
        P("PREFLOP", "Player 1", "POST_SB", 50),
        P("PREFLOP", "Hero", "POST_BB", 100),
        P("PREFLOP", "Player 1", "CALL", 50),
        P("PREFLOP", "Hero", "CHECK"),
        P("FLOP", "Hero", "BET", 100),
        P("FLOP", "Player 1", "RAISE", 300),
        P("FLOP", "Hero", "CALL", 200),
      ],
    };
    expect(facingRaiseAlternatives(s)).toHaveLength(0);
  });
});

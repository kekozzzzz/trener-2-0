import { describe, it, expect } from "vitest";
import type { Position, Street, TableAction, TableSnapshot } from "@/parser/types";
import { cbetSpots } from "@/parser/alternatives";

const A = (street: Street, actor: string, action: TableAction["action"], amount?: number): TableAction =>
  ({ street, actor, action, amount });

function snap(heroPos: Position, board: string[], actions: TableAction[]): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: heroPos, positionName: heroPos, startingStack: 5000, seatNumber: 1 },
      { label: "Player 1", position: "BB", positionName: "BB", startingStack: 5000, seatNumber: 2 },
      { label: "SBp", position: "SB", positionName: "SB", startingStack: 5000, seatNumber: 3 },
    ],
    heroCards: ["Ac", "Qd"],
    board,
    tableSize: 3,
    buttonSeat: 1,
    potTotal: 0,
    actions,
  };
}

// Hero открылся с CO, BB заколлил (Hero - агрессор, IP).
const heroOpens = [
  A("PREFLOP", "SBp", "POST_SB", 50),
  A("PREFLOP", "Player 1", "POST_BB", 100),
  A("PREFLOP", "Hero", "RAISE", 250),
  A("PREFLOP", "SBp", "FOLD"),
  A("PREFLOP", "Player 1", "CALL", 150),
];

describe("cbetSpots — агрессор прочекал c-bet на своей доске", () => {
  it("K-high доска, Hero(агрессор) прочекал → упущенный c-bet", () => {
    const s = snap("CO", ["Ks", "9h", "3d"], [...heroOpens, A("FLOP", "Player 1", "CHECK"), A("FLOP", "Hero", "CHECK")]);
    const spots = cbetSpots(s);
    expect(spots).toHaveLength(1);
    expect(spots[0].street).toBe("FLOP");
    expect(spots[0].foldsNeededPct).toBeGreaterThan(0);
  });

  it("низкая доска (7-5-2) → не твоя доска, чек нормален → молчим", () => {
    const s = snap("CO", ["7h", "5c", "2d"], [...heroOpens, A("FLOP", "Player 1", "CHECK"), A("FLOP", "Hero", "CHECK")]);
    expect(cbetSpots(s)).toHaveLength(0);
  });

  it("Hero не агрессор (заколлил) → не c-bet-спот", () => {
    const s = snap("BB", ["Ks", "9h", "3d"], [
      A("PREFLOP", "SBp", "POST_SB", 50),
      A("PREFLOP", "Hero", "POST_BB", 100),
      A("PREFLOP", "Player 1", "RAISE", 250),
      A("PREFLOP", "SBp", "FOLD"),
      A("PREFLOP", "Hero", "CALL", 150),
      A("FLOP", "Hero", "CHECK"),
      A("FLOP", "Player 1", "CHECK"),
    ]);
    expect(cbetSpots(s)).toHaveLength(0);
  });

  it("Hero поставил c-bet → не упустил", () => {
    const s = snap("CO", ["Ks", "9h", "3d"], [...heroOpens, A("FLOP", "Player 1", "CHECK"), A("FLOP", "Hero", "BET", 300)]);
    expect(cbetSpots(s)).toHaveLength(0);
  });

  it("Hero сыграл чек-рейз → был агрессивен, не упустил", () => {
    const s = snap("SB", ["Ks", "9h", "3d"], [
      A("PREFLOP", "Hero", "POST_SB", 50),
      A("PREFLOP", "Player 1", "POST_BB", 100),
      A("PREFLOP", "Hero", "RAISE", 250),
      A("PREFLOP", "Player 1", "CALL", 150),
      A("FLOP", "Hero", "CHECK"),
      A("FLOP", "Player 1", "BET", 200),
      A("FLOP", "Hero", "RAISE", 600),
    ]);
    expect(cbetSpots(s)).toHaveLength(0);
  });
});

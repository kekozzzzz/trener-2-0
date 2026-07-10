import { describe, it, expect } from "vitest";
import type { Position, Street, TableAction, TableSnapshot } from "@/parser/types";
import { probeBetSpots } from "@/parser/alternatives";

const A = (street: Street, actor: string, action: TableAction["action"], amount?: number): TableAction =>
  ({ street, actor, action, amount });

function snap(heroPos: Position, board: string[], actions: TableAction[]): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: heroPos, positionName: heroPos, startingStack: 5000, seatNumber: 1 },
      { label: "Player 1", position: "BTN", positionName: "BTN", startingStack: 5000, seatNumber: 2 },
      { label: "SBp", position: "SB", positionName: "SB", startingStack: 5000, seatNumber: 3 },
    ],
    heroCards: ["Qd", "Jc"],
    board,
    tableSize: 3,
    buttonSeat: 2,
    potTotal: 0,
    actions,
  };
}

// Защита BB: BTN открылся, Hero(BB) заколлил, флоп прочекан насквозь.
const bbDefensePreflop = [
  A("PREFLOP", "SBp", "POST_SB", 50),
  A("PREFLOP", "Hero", "POST_BB", 100),
  A("PREFLOP", "Player 1", "RAISE", 250),
  A("PREFLOP", "SBp", "FOLD"),
  A("PREFLOP", "Hero", "CALL", 150),
];
const flopCheckThrough = [A("FLOP", "Hero", "CHECK"), A("FLOP", "Player 1", "CHECK")];

describe("probeBetSpots — соперник не поставил c-bet, лид терна", () => {
  it("защита BB, нет c-bet, Hero прочекал терн → упущенная проба", () => {
    const s = snap("BB", ["Ks", "9h", "3d", "7c"], [...bbDefensePreflop, ...flopCheckThrough, A("TURN", "Hero", "CHECK")]);
    const spots = probeBetSpots(s);
    expect(spots).toHaveLength(1);
    expect(spots[0].street).toBe("TURN");
    expect(spots[0].foldsNeededPct).toBeGreaterThan(0);
    expect(spots[0].suggestedBet).toBeGreaterThan(0);
  });

  it("Hero сам был префлоп-агрессором → не проба (это c-bet-спот)", () => {
    const s = snap("CO", ["Ks", "9h", "3d", "7c"], [
      A("PREFLOP", "SBp", "POST_SB", 50),
      A("PREFLOP", "Player 1", "POST_BB", 100),
      A("PREFLOP", "Hero", "RAISE", 250),
      A("PREFLOP", "SBp", "FOLD"),
      A("PREFLOP", "Player 1", "CALL", 150),
      A("FLOP", "Player 1", "CHECK"),
      A("FLOP", "Hero", "CHECK"),
      A("TURN", "Player 1", "CHECK"),
      A("TURN", "Hero", "CHECK"),
    ]);
    expect(probeBetSpots(s)).toHaveLength(0);
  });

  it("был c-bet (флоп не прочекан) → не проба", () => {
    const s = snap("BB", ["Ks", "9h", "3d", "7c"], [
      ...bbDefensePreflop,
      A("FLOP", "Hero", "CHECK"),
      A("FLOP", "Player 1", "BET", 150),
      A("FLOP", "Hero", "CALL", 150),
      A("TURN", "Hero", "CHECK"),
    ]);
    expect(probeBetSpots(s)).toHaveLength(0);
  });

  it("Hero сам пробил терн → пробу не упустил", () => {
    const s = snap("BB", ["Ks", "9h", "3d", "7c"], [...bbDefensePreflop, ...flopCheckThrough, A("TURN", "Hero", "BET", 350)]);
    expect(probeBetSpots(s)).toHaveLength(0);
  });
});

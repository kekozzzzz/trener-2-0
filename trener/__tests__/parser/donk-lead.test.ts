import { describe, it, expect } from "vitest";
import type { Position, Street, TableAction, TableSnapshot } from "@/parser/types";
import { donkLeads } from "@/parser/initiative";

const A = (street: Street, actor: string, action: TableAction["action"], amount?: number): TableAction =>
  ({ street, actor, action, amount });

function snap(heroPos: Position, actions: TableAction[]): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: heroPos, positionName: heroPos, startingStack: 5000, seatNumber: 1 },
      { label: "Player 1", position: "BTN", positionName: "BTN", startingStack: 5000, seatNumber: 2 },
    ],
    heroCards: ["Ah", "Kd"],
    board: ["Ts", "6c", "3d"],
    tableSize: 2,
    buttonSeat: 2,
    potTotal: 0,
    actions,
  };
}

describe("donkLeads — донк в агрессора", () => {
  it("Hero (не агрессор) поставил первым на флопе → донк-лид", () => {
    const r = donkLeads(snap("BB", [
      A("PREFLOP", "Player 1", "POST_SB", 50), A("PREFLOP", "Hero", "POST_BB", 100),
      A("PREFLOP", "Player 1", "RAISE", 250), A("PREFLOP", "Hero", "CALL", 150),
      A("FLOP", "Hero", "BET", 150),
    ]));
    expect(r).toHaveLength(1);
    expect(r[0].street).toBe("FLOP");
    expect(r[0].betSize).toBe(150);
  });

  it("Hero сам агрессор бьёт флоп → это c-bet, не донк", () => {
    const r = donkLeads(snap("SB", [
      A("PREFLOP", "Hero", "POST_SB", 50), A("PREFLOP", "Player 1", "POST_BB", 100),
      A("PREFLOP", "Hero", "RAISE", 250), A("PREFLOP", "Player 1", "CALL", 150),
      A("FLOP", "Hero", "BET", 150),
    ]));
    expect(r).toHaveLength(0);
  });

  it("Hero прочекал агрессору → не донк", () => {
    const r = donkLeads(snap("BB", [
      A("PREFLOP", "Player 1", "POST_SB", 50), A("PREFLOP", "Hero", "POST_BB", 100),
      A("PREFLOP", "Player 1", "RAISE", 250), A("PREFLOP", "Hero", "CALL", 150),
      A("FLOP", "Hero", "CHECK"),
    ]));
    expect(r).toHaveLength(0);
  });
});

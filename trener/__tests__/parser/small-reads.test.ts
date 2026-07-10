import { describe, it, expect } from "vitest";
import type { Position, Street, TableAction, TableSnapshot } from "@/parser/types";
import { facingDonk, openSizeRead } from "@/parser/initiative";
import { bountyAdjustedCallPct } from "@/parser/blockers";

const A = (street: Street, actor: string, action: TableAction["action"], amount?: number): TableAction =>
  ({ street, actor, action, amount });

function snap(heroPos: Position, actions: TableAction[]): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: heroPos, positionName: heroPos, startingStack: 5000, seatNumber: 1 },
      { label: "Player 1", position: "BB", positionName: "BB", startingStack: 5000, seatNumber: 2 },
      { label: "SBp", position: "SB", positionName: "SB", startingStack: 5000, seatNumber: 3 },
    ],
    heroCards: ["Ah", "Kd"],
    board: ["Ts", "6c", "3d"],
    tableSize: 3,
    buttonSeat: 1,
    potTotal: 0,
    actions,
  };
}

const heroOpens = [
  A("PREFLOP", "SBp", "POST_SB", 50),
  A("PREFLOP", "Player 1", "POST_BB", 100),
  A("PREFLOP", "Hero", "RAISE", 250),
  A("PREFLOP", "SBp", "FOLD"),
  A("PREFLOP", "Player 1", "CALL", 150),
];

describe("facingDonk", () => {
  it("Hero-агрессор, соперник донкнул флоп → рид", () => {
    const r = facingDonk(snap("CO", [...heroOpens, A("FLOP", "Player 1", "BET", 150)]));
    expect(r).toHaveLength(1);
    expect(r[0].donker).toBe("Player 1");
  });
  it("соперник прочекал (не донк) → молчим", () => {
    const r = facingDonk(snap("CO", [...heroOpens, A("FLOP", "Player 1", "CHECK"), A("FLOP", "Hero", "CHECK")]));
    expect(r).toHaveLength(0);
  });
});

describe("openSizeRead", () => {
  it("соперник открылся 3 BB → крупный опен (рид)", () => {
    const r = openSizeRead(snap("BB", [
      A("PREFLOP", "SBp", "POST_SB", 50), A("PREFLOP", "Hero", "POST_BB", 100),
      A("PREFLOP", "Player 1", "RAISE", 300), A("PREFLOP", "SBp", "FOLD"), A("PREFLOP", "Hero", "CALL", 200),
    ]));
    expect(r?.openBb).toBe(3);
  });
  it("стандартный опен 2 BB → не рид", () => {
    const r = openSizeRead(snap("BB", [
      A("PREFLOP", "SBp", "POST_SB", 50), A("PREFLOP", "Hero", "POST_BB", 100),
      A("PREFLOP", "Player 1", "RAISE", 200), A("PREFLOP", "SBp", "FOLD"), A("PREFLOP", "Hero", "CALL", 100),
    ]));
    expect(r).toBeNull();
  });
  it("открылся сам Hero → не рид (про оппонента)", () => {
    expect(openSizeRead(snap("CO", heroOpens))).toBeNull();
  });
});

describe("bountyAdjustedCallPct", () => {
  it("баунти снижает порог колла", () => {
    expect(bountyAdjustedCallPct(100, 300, 0)).toBe(25); // без баунти
    expect(bountyAdjustedCallPct(100, 300, 200)).toBe(17); // с головой 200 → ниже
  });
});

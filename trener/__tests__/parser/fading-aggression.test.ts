import { describe, it, expect } from "vitest";
import type { Street, TableAction, TableSnapshot } from "@/parser/types";
import { fadingAggression } from "@/parser/initiative";

const A = (street: Street, actor: string, action: TableAction["action"], amount?: number): TableAction =>
  ({ street, actor, action, amount });

// HU. Пример Артёма: борд T-6-3, тёрн валет, ривер двойка.
function snap(postflop: TableAction[]): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: "BB", positionName: "BB", startingStack: 5000, seatNumber: 1 },
      { label: "Player 1", position: "BTN", positionName: "BTN", startingStack: 5000, seatNumber: 2 },
    ],
    heroCards: ["Ah", "Kd"],
    board: ["Th", "6c", "3d", "Js", "2h"],
    tableSize: 2,
    buttonSeat: 2,
    potTotal: 0,
    actions: [
      A("PREFLOP", "Player 1", "POST_SB", 50),
      A("PREFLOP", "Hero", "POST_BB", 100),
      A("PREFLOP", "Player 1", "RAISE", 250),
      A("PREFLOP", "Hero", "CALL", 150),
      ...postflop,
    ],
  };
}

describe("fadingAggression — соперник ослабил линию (мягкий рид)", () => {
  it("бет-бет-чек → фейд на ривере", () => {
    const r = fadingAggression(snap([
      A("FLOP", "Hero", "CHECK"), A("FLOP", "Player 1", "BET", 150), A("FLOP", "Hero", "CALL", 150),
      A("TURN", "Hero", "CHECK"), A("TURN", "Player 1", "BET", 400), A("TURN", "Hero", "CALL", 400),
      A("RIVER", "Hero", "CHECK"), A("RIVER", "Player 1", "CHECK"),
    ]));
    expect(r).toHaveLength(1);
    expect(r[0].checkStreet).toBe("RIVER");
    expect(r[0].betStreets).toEqual(["FLOP", "TURN"]);
  });

  it("бет флопа, чек тёрна → фейд", () => {
    const r = fadingAggression(snap([
      A("FLOP", "Hero", "CHECK"), A("FLOP", "Player 1", "BET", 150), A("FLOP", "Hero", "CALL", 150),
      A("TURN", "Hero", "CHECK"), A("TURN", "Player 1", "CHECK"),
    ]));
    expect(r).toHaveLength(1);
    expect(r[0].checkStreet).toBe("TURN");
  });

  it("бет-бет-бет (не ослаблял) → фейда нет", () => {
    const r = fadingAggression(snap([
      A("FLOP", "Hero", "CHECK"), A("FLOP", "Player 1", "BET", 150), A("FLOP", "Hero", "CALL", 150),
      A("TURN", "Hero", "CHECK"), A("TURN", "Player 1", "BET", 400), A("TURN", "Hero", "CALL", 400),
      A("RIVER", "Hero", "CHECK"), A("RIVER", "Player 1", "BET", 900),
    ]));
    expect(r).toHaveLength(0);
  });

  it("бет-чек-бет (перезарядил ривер) → фейда нет (последнее действие - бет)", () => {
    const r = fadingAggression(snap([
      A("FLOP", "Hero", "CHECK"), A("FLOP", "Player 1", "BET", 150), A("FLOP", "Hero", "CALL", 150),
      A("TURN", "Hero", "CHECK"), A("TURN", "Player 1", "CHECK"),
      A("RIVER", "Hero", "CHECK"), A("RIVER", "Player 1", "BET", 500),
    ]));
    expect(r).toHaveLength(0);
  });

  it("прочекали насквозь (соперник не ставил) → фейда нет", () => {
    const r = fadingAggression(snap([
      A("FLOP", "Hero", "CHECK"), A("FLOP", "Player 1", "CHECK"),
      A("TURN", "Hero", "CHECK"), A("TURN", "Player 1", "CHECK"),
    ]));
    expect(r).toHaveLength(0);
  });
});

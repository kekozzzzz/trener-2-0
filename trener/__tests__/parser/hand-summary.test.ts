import { describe, it, expect } from "vitest";
import type { TableAction, TableSnapshot } from "@/parser/types";
import { heroDecisionLabel } from "@/parser/hand-summary";

function snap(actions: TableAction[]): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions } as unknown as TableSnapshot;
}

describe("heroDecisionLabel", () => {
  it("олл-ин Hero на префлопе", () => {
    expect(
      heroDecisionLabel(
        snap([
          { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 3 },
          { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 25 },
        ]),
      ),
    ).toBe("олл-ин на префлопе");
  });

  it("колл олл-ина соперника — отдельный случай", () => {
    expect(
      heroDecisionLabel(
        snap([
          { street: "RIVER", actor: "Player 2", action: "ALL_IN", amount: 50 },
          { street: "RIVER", actor: "Hero", action: "CALL", amount: 50 },
        ]),
      ),
    ).toBe("колл олл-ина на ривере");
  });

  it("обычный колл (без олл-ина соперника)", () => {
    expect(
      heroDecisionLabel(
        snap([
          { street: "FLOP", actor: "Player 2", action: "BET", amount: 5 },
          { street: "FLOP", actor: "Hero", action: "CALL", amount: 5 },
        ]),
      ),
    ).toBe("колл на флопе");
  });

  it("берётся ПОСЛЕДНЕЕ добровольное действие Hero", () => {
    expect(
      heroDecisionLabel(
        snap([
          { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 3 },
          { street: "FLOP", actor: "Hero", action: "BET", amount: 5 },
          { street: "RIVER", actor: "Hero", action: "CALL", amount: 10 },
        ]),
      ),
    ).toBe("колл на ривере");
  });

  it("Hero только чек/фолд — описывать нечего", () => {
    expect(
      heroDecisionLabel(
        snap([
          { street: "PREFLOP", actor: "Hero", action: "CHECK" },
          { street: "FLOP", actor: "Hero", action: "FOLD" },
        ]),
      ),
    ).toBeNull();
  });
});

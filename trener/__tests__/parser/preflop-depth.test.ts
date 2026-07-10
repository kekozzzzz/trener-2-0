import { describe, it, expect } from "vitest";
import type { Position, TableAction, TableSnapshot } from "@/parser/types";
import { preflopCallDepth } from "@/parser/preflop-depth";

const P = (actor: string, action: TableAction["action"], amount?: number): TableAction =>
  ({ street: "PREFLOP", actor, action, amount });

function build(heroPos: Position, heroName: string, heroStack: number, cards: string[], acts: TableAction[]): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: heroPos, positionName: heroName, startingStack: heroStack, seatNumber: 1 },
      { label: "Opener", position: "BTN", positionName: "BTN", startingStack: 10000, seatNumber: 2 },
      { label: "BBp", position: "BB", positionName: "BB", startingStack: 5000, seatNumber: 3 },
      { label: "SBp", position: "SB", positionName: "SB", startingStack: 5000, seatNumber: 4 },
    ],
    heroCards: cards,
    board: [],
    tableSize: 8,
    buttonSeat: 2,
    potTotal: 0,
    actions: acts,
  };
}

describe("preflopCallDepth — глубина колла рейза", () => {
  it("глубокий колл опена (100bb) → имплайды ЖИВЫ (SPR высокий)", () => {
    const s = build("CO", "CO", 10000, ["5h", "5d"], [
      P("SBp", "POST_SB", 50), P("BBp", "POST_BB", 100), P("Opener", "RAISE", 250), P("Hero", "CALL", 250),
    ]);
    const d = preflopCallDepth(s);
    expect(d?.level).toBe("OPEN");
    expect(d?.impliedOddsAlive).toBe(true);
    expect(d?.projectedFlopSpr).toBeGreaterThan(10);
  });

  it("короткий колл опена (12bb) → имплайды МЕРТВЫ (SPR ~1-2)", () => {
    const s = build("CO", "CO", 1200, ["5h", "5d"], [
      P("SBp", "POST_SB", 50), P("BBp", "POST_BB", 100), P("Opener", "RAISE", 250), P("Hero", "CALL", 250),
    ]);
    const d = preflopCallDepth(s);
    expect(d?.level).toBe("OPEN");
    expect(d?.impliedOddsAlive).toBe(false);
    expect(d?.projectedFlopSpr).toBeLessThan(2);
  });

  it("колл 3-бета → уровень 3BET, SPR посчитан", () => {
    const s = build("CO", "CO", 5000, ["7h", "7d"], [
      P("SBp", "POST_SB", 50), P("BBp", "POST_BB", 100),
      P("Hero", "RAISE", 250), P("Opener", "RAISE", 750), P("SBp", "FOLD"), P("BBp", "FOLD"), P("Hero", "CALL", 500),
    ]);
    const d = preflopCallDepth(s);
    expect(d?.level).toBe("3BET");
    expect(d?.projectedFlopSpr).toBeGreaterThan(0);
  });

  it("колл 4-бета → уровень 4BET", () => {
    const s = build("CO", "CO", 8000, ["Ah", "Ks"], [
      P("SBp", "POST_SB", 50), P("BBp", "POST_BB", 100),
      P("Opener", "RAISE", 250), P("Hero", "RAISE", 750), P("Opener", "RAISE", 2000), P("Hero", "CALL", 1250),
    ]);
    const d = preflopCallDepth(s);
    expect(d?.level).toBe("4BET");
  });

  it("нет колла рейза (Hero открылся) → null", () => {
    const s = build("CO", "CO", 5000, ["As", "Ks"], [
      P("SBp", "POST_SB", 50), P("BBp", "POST_BB", 100), P("Hero", "RAISE", 250),
    ]);
    expect(preflopCallDepth(s)).toBeNull();
  });
});

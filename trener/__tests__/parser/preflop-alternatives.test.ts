import { describe, it, expect } from "vitest";
import type { Position, TableAction, TableSnapshot } from "@/parser/types";
import { preflopAlternatives } from "@/parser/preflop-alternatives";

// 8-max, 50 BB. Детекторам важны позиция Hero + последовательность действий (чужие
// места не проверяются), поэтому снимок минимальный.
function snap(heroPos: Position, heroName: string, cards: string[], acts: TableAction[]): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: heroPos, positionName: heroName, startingStack: 5000, seatNumber: 1 },
      { label: "BBp", position: "BB", positionName: "BB", startingStack: 5000, seatNumber: 2 },
      { label: "SBp", position: "SB", positionName: "SB", startingStack: 5000, seatNumber: 3 },
    ],
    heroCards: cards,
    board: [],
    tableSize: 8,
    buttonSeat: 1,
    potTotal: 0,
    actions: acts,
  };
}

const P = (actor: string, action: TableAction["action"], amount?: number): TableAction =>
  ({ street: "PREFLOP", actor, action, amount });

const blindsThenFolds = (folders: number): TableAction[] => [
  P("SBp", "POST_SB", 50),
  P("BBp", "POST_BB", 100),
  ...Array.from({ length: folders }, (_, i) => P(`F${i}`, "FOLD")),
];

describe("preflopAlternatives", () => {
  it("open-лимп рукой из чарта → ветка ОТКРЫТЬ РЕЙЗОМ (ALWAYS)", () => {
    const s = snap("CO", "CO", ["Ks", "Js"], [...blindsThenFolds(4), P("Hero", "CALL", 100)]);
    const alt = preflopAlternatives(s);
    expect(alt?.actualAction).toBe("OPEN_LIMP");
    expect(alt?.altAction).toBe("OPEN_RAISE");
    expect(alt?.chartState).toBe("ALWAYS");
    expect(alt?.code).toBe("KJs");
  });

  it("open-лимп мусором вне чарта → ветка ФОЛД (OUT)", () => {
    const s = snap("CO", "CO", ["9h", "2c"], [...blindsThenFolds(4), P("Hero", "CALL", 100)]);
    const alt = preflopAlternatives(s);
    expect(alt?.altAction).toBe("FOLD");
    expect(alt?.chartState).toBe("OUT");
  });

  it("SB-лимп сильной рукой → ветка РЕЙЗ 3-3.5bb (ALWAYS)", () => {
    const s = snap("SB", "SB", ["Ah", "Kd"], [P("Hero", "POST_SB", 50), P("BBp", "POST_BB", 100), ...Array.from({ length: 6 }, (_, i) => P(`F${i}`, "FOLD")), P("Hero", "CALL", 50)]);
    const alt = preflopAlternatives(s);
    expect(alt?.actualAction).toBe("SB_LIMP");
    expect(alt?.altAction).toBe("SB_RAISE");
    expect(alt?.code).toBe("AKo");
  });

  it("SB-лимп слабой рукой → молчим (SB-лимп не утечка)", () => {
    const s = snap("SB", "SB", ["7h", "2c"], [P("Hero", "POST_SB", 50), P("BBp", "POST_BB", 100), ...Array.from({ length: 6 }, (_, i) => P(`F${i}`, "FOLD")), P("Hero", "CALL", 50)]);
    expect(preflopAlternatives(s)).toBeNull();
  });

  it("фолд премиума первым в игру → упущенный вход (ALWAYS)", () => {
    const s = snap("EARLY", "UTG", ["Ah", "As"], [P("SBp", "POST_SB", 50), P("BBp", "POST_BB", 100), P("Hero", "FOLD")]);
    const alt = preflopAlternatives(s);
    expect(alt?.actualAction).toBe("FOLD_FIRST_IN");
    expect(alt?.altAction).toBe("OPEN_RAISE");
    expect(alt?.code).toBe("AA");
  });

  it("фолд мусора первым в игру → молчим (фолд верен)", () => {
    const s = snap("EARLY", "UTG", ["7h", "2c"], [P("SBp", "POST_SB", 50), P("BBp", "POST_BB", 100), P("Hero", "FOLD")]);
    expect(preflopAlternatives(s)).toBeNull();
  });

  it("нормальное открытие рейзом → нет альтернативы", () => {
    const s = snap("CO", "CO", ["Ks", "Js"], [...blindsThenFolds(4), P("Hero", "RAISE", 250)]);
    expect(preflopAlternatives(s)).toBeNull();
  });
});

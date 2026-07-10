import { describe, it, expect } from "vitest";
import type { Street, TableAction, TableSnapshot } from "@/parser/types";
import { checkBetAlternatives } from "@/parser/alternatives";

const A = (street: Street, actor: string, action: TableAction["action"], amount?: number): TableAction =>
  ({ street, actor, action, amount });

// HU: Hero(BB) vs Player 1(SB). Префлоп доводим до флопа, дальше - переданные действия флопа.
function snap(heroCards: string[], board: string[], flop: TableAction[]): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: "BB", positionName: "BB", startingStack: 5000, seatNumber: 1 },
      { label: "Player 1", position: "SB", positionName: "SB", startingStack: 5000, seatNumber: 2 },
    ],
    heroCards,
    board,
    tableSize: 2,
    buttonSeat: 2,
    potTotal: 0,
    actions: [
      A("PREFLOP", "Player 1", "POST_SB", 50),
      A("PREFLOP", "Hero", "POST_BB", 100),
      A("PREFLOP", "Player 1", "CALL", 50),
      A("PREFLOP", "Hero", "CHECK"),
      ...flop,
    ],
  };
}

const CHECK_THROUGH = [A("FLOP", "Hero", "CHECK"), A("FLOP", "Player 1", "CHECK")];

describe("checkBetAlternatives — упущенный бет на прочеканной улице", () => {
  it("сет прочекали → упущенный ВЕЛЬЮ-бет (недобор)", () => {
    const alts = checkBetAlternatives(snap(["9c", "9d"], ["Ks", "9s", "3h"], CHECK_THROUGH));
    expect(alts).toHaveLength(1);
    expect(alts[0].reason).toBe("MISSED_VALUE");
    expect(alts[0].suggestedBet).toBeGreaterThan(0);
    expect(alts[0].potIfCalled).toBeGreaterThan(0);
  });

  it("флеш-дро прочекали → упущенный ПОЛУ-БЛЕФ (с фолд-эквити и эквити дро)", () => {
    const alts = checkBetAlternatives(snap(["As", "5s"], ["Ks", "9s", "3h"], CHECK_THROUGH));
    expect(alts).toHaveLength(1);
    expect(alts[0].reason).toBe("MISSED_SEMI_BLUFF");
    expect(alts[0].foldsNeededPct).toBeGreaterThan(0);
    expect(alts[0].drawEquityRawPct).toBeGreaterThan(0);
  });

  it("воздух без дро прочекали → молчим (чек нормален)", () => {
    expect(checkBetAlternatives(snap(["Qd", "4c"], ["Ks", "9h", "3d"], CHECK_THROUGH))).toHaveLength(0);
  });

  it("средняя пара прочекали → молчим (не сильная рука)", () => {
    expect(checkBetAlternatives(snap(["Ad", "9h"], ["Kc", "9s", "3d"], CHECK_THROUGH))).toHaveLength(0);
  });

  it("была ставка (чек-колл/чек-рейз) → не трогаем, это не «прочекали»", () => {
    const withBet = [A("FLOP", "Hero", "CHECK"), A("FLOP", "Player 1", "BET", 100), A("FLOP", "Hero", "CALL", 100)];
    expect(checkBetAlternatives(snap(["9c", "9d"], ["Ks", "9s", "3h"], withBet))).toHaveLength(0);
  });
});

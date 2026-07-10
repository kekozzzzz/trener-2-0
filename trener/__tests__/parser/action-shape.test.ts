import { describe, it, expect } from "vitest";
import type { TableSnapshot } from "@/parser/types";
import { heroActionShapes } from "@/parser/action-shape";

// Минимальный снимок: HU, Hero(BB) ставит на флопе. Для формы важны только карты+борд.
function flopBet(heroCards: string[], board: string[]): TableSnapshot {
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
      { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 50 },
      { street: "PREFLOP", actor: "Hero", action: "CHECK" },
      { street: "FLOP", actor: "Hero", action: "BET", amount: 200 },
    ],
  };
}

const shapeOf = (hero: string[], board: string[]) => heroActionShapes(flopBet(hero, board))[0]?.shape;

describe("heroActionShapes — форма ставки Hero", () => {
  it("воздух + флеш-дро = полу-блеф", () => {
    expect(shapeOf(["As", "5s"], ["Ks", "9s", "3h"])).toBe("SEMI_BLUFF");
  });

  it("сет = велью", () => {
    expect(shapeOf(["9c", "9s"], ["Kh", "9d", "3c"])).toBe("VALUE");
  });

  it("топ-пара на дровяной доске = защита", () => {
    expect(shapeOf(["Ad", "Kc"], ["Ks", "9s", "3h"])).toBe("PROTECTION");
  });

  it("топ-пара на сухой доске = тонкое велью", () => {
    expect(shapeOf(["Ad", "Kc"], ["Kh", "7c", "2d"])).toBe("THIN_VALUE");
  });

  it("чистый воздух = блеф", () => {
    expect(shapeOf(["Qd", "4s"], ["8h", "6c", "2d"])).toBe("BLUFF");
  });

  it("вторая пара = маргинально (спросить игрока)", () => {
    expect(shapeOf(["Ad", "9h"], ["Kc", "9s", "3d"])).toBe("MARGINAL");
  });

  it("чек не классифицируется (форма только у ставки/рейза)", () => {
    const snap = flopBet(["As", "5s"], ["Ks", "9s", "3h"]);
    snap.actions[snap.actions.length - 1] = { street: "FLOP", actor: "Hero", action: "CHECK" };
    expect(heroActionShapes(snap)).toHaveLength(0);
  });
});

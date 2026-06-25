import { describe, it, expect } from "vitest";
import { detectHeroOpen } from "@/parser/open-raise";
import type { Position, TableAction, TableSnapshot } from "@/parser/types";

// Стол на 40bb (BB=100): SB и BB постят, далее действия префлопа. Hero на CO.
function snap(opts: {
  heroCards: string[];
  heroPosition?: Position;
  heroStack?: number;
  preflop: TableAction[];
}): TableSnapshot {
  return {
    seats: [
      { label: "Player 1", position: "SB", startingStack: 4000 },
      { label: "Player 2", position: "BB", startingStack: 4000 },
      { label: "Hero", position: opts.heroPosition ?? "CO", startingStack: opts.heroStack ?? 4000 },
    ],
    heroCards: opts.heroCards,
    board: [],
    actions: [
      { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 },
      ...opts.preflop,
    ],
    potTotal: 0,
  };
}

describe("detectHeroOpen — открылся первым", () => {
  it("Hero первым делает рейз → открытие с позицией и кодом руки", () => {
    const s = snap({
      heroCards: ["Kc", "7c"],
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      ],
    });
    expect(detectHeroOpen(s)).toEqual({ position: "CO", code: "K7s" });
  });

  it("лимп перед Hero → не открытие", () => {
    const s = snap({
      heroCards: ["Kc", "7c"],
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "CALL", amount: 100 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 300 },
      ],
    });
    expect(detectHeroOpen(s)).toBeNull();
  });

  it("рейз перед Hero → не открытие (это 3-бет/изоляция)", () => {
    const s = snap({
      heroCards: ["Kc", "7c"],
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "RAISE", amount: 300 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 900 },
      ],
    });
    expect(detectHeroOpen(s)).toBeNull();
  });

  it("Hero не рейзит первым (колл) → не открытие", () => {
    const s = snap({
      heroCards: ["Kc", "7c"],
      preflop: [{ street: "PREFLOP", actor: "Hero", action: "CALL", amount: 100 }],
    });
    expect(detectHeroOpen(s)).toBeNull();
  });

  it("короткий стек (15bb) → пуш-фолд, не судим", () => {
    const s = snap({
      heroCards: ["Kc", "7c"],
      heroStack: 1500,
      preflop: [{ street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 }],
    });
    expect(detectHeroOpen(s)).toBeNull();
  });

  it("олл-ин первым (не чистый рейз) → не открытие", () => {
    const s = snap({
      heroCards: ["Kc", "7c"],
      preflop: [{ street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 4000 }],
    });
    expect(detectHeroOpen(s)).toBeNull();
  });
});

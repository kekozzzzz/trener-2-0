import { describe, it, expect } from "vitest";
import { detectHeroLimp } from "@/parser/limp";
import type { Position, TableAction, TableSnapshot } from "@/parser/types";

// Стол на 40bb (BB=100): SB и BB постят, далее действия префлопа. Hero на CO по умолчанию.
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

describe("detectHeroLimp — лимп Hero на префлопе", () => {
  it("Hero первым колл BB → открыл лимпом (OPEN)", () => {
    const s = snap({
      heroCards: ["Kc", "7c"],
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 100 },
      ],
    });
    expect(detectHeroLimp(s)).toEqual({ position: "CO", code: "K7s", kind: "OPEN" });
  });

  it("лимпер впереди, Hero тоже колл → долимпил (OVER)", () => {
    const s = snap({
      heroCards: ["Ad", "Js"],
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "CALL", amount: 100 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 100 },
      ],
    });
    expect(detectHeroLimp(s)).toEqual({ position: "CO", code: "AJo", kind: "OVER" });
  });

  it("Hero изолирует лимпера рейзом → не лимп", () => {
    const s = snap({
      heroCards: ["Ad", "Js"],
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "CALL", amount: 100 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 400 },
      ],
    });
    expect(detectHeroLimp(s)).toBeNull();
  });

  it("рейз впереди, Hero коллирует → колл рейза, не лимп", () => {
    const s = snap({
      heroCards: ["Ad", "Js"],
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "RAISE", amount: 300 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 300 },
      ],
    });
    expect(detectHeroLimp(s)).toBeNull();
  });

  it("Hero открывается рейзом → не лимп", () => {
    const s = snap({
      heroCards: ["Kc", "7c"],
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      ],
    });
    expect(detectHeroLimp(s)).toBeNull();
  });

  it("Hero фолдит → не лимп", () => {
    const s = snap({
      heroCards: ["Kc", "7c"],
      preflop: [{ street: "PREFLOP", actor: "Hero", action: "FOLD" }],
    });
    expect(detectHeroLimp(s)).toBeNull();
  });

  it("короткий стек (15bb) → пуш-фолд, не судим", () => {
    const s = snap({
      heroCards: ["Kc", "7c"],
      heroStack: 1500,
      preflop: [{ street: "PREFLOP", actor: "Hero", action: "CALL", amount: 100 }],
    });
    expect(detectHeroLimp(s)).toBeNull();
  });

  it("малый блайнд завершает (колл до BB) при фолдах → лимп SB (OPEN)", () => {
    const s = snap({
      heroCards: ["Qd", "9d"],
      heroPosition: "SB",
      preflop: [
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 50 },
      ],
    });
    expect(detectHeroLimp(s)).toEqual({ position: "SB", code: "Q9s", kind: "OPEN" });
  });
});

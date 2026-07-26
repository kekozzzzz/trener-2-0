import { describe, it, expect } from "vitest";
import type { TableAction, TableSnapshot } from "@/parser/types";
import { detectHeroOpenFacedThreeBet } from "@/parser/vs-open-3bet-faced";

// Стол: Hero открывается с HJ, дальше настраиваемая цепочка ответов до флопа.
function snap(opts: {
  heroCards?: string[];
  heroOpen: TableAction;
  after: TableAction[]; // всё, что происходит после открытия Hero
  threebetterCoarse?: TableSnapshot["seats"][number]["position"];
  threebetterName?: string;
}): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: "HJ", positionName: "HJ", startingStack: 4000 },
      {
        label: "Player 2",
        position: opts.threebetterCoarse ?? "CO",
        positionName: opts.threebetterName ?? "CO",
        startingStack: 4000,
      },
      { label: "Player 3", position: "BTN", positionName: "BTN", startingStack: 4000 },
      { label: "SBP", position: "SB", startingStack: 4000 },
      { label: "BBP", position: "BB", startingStack: 4000 },
    ],
    heroCards: opts.heroCards ?? ["Kc", "Qd"],
    board: [],
    actions: [
      { street: "PREFLOP", actor: "SBP", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "BBP", action: "POST_BB", amount: 100 },
      opts.heroOpen,
      ...opts.after,
    ],
    potTotal: 0,
  };
}

describe("detectHeroOpenFacedThreeBet — Hero открылся и получил 3-бет", () => {
  it("чистый спот: HJ открылся, CO 3-бетнул, Hero отвечает → CO", () => {
    const s = snap({
      heroOpen: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1200 },
      after: [
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 4215 },
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "SBP", action: "FOLD" },
        { street: "PREFLOP", actor: "BBP", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 17899 },
      ],
    });
    expect(detectHeroOpenFacedThreeBet(s)).toEqual({
      threebetterSeatLabel: "Player 2",
      threebetterPosition: "CO",
      heroAction: "ALL_IN",
    });
  });

  it("реальная раздача 179eec8d (регресс 26.07): HJ открылся, CO 3-бетнул, Hero олл-ин", () => {
    const s: TableSnapshot = {
      board: ["5d", "7c", "Tc", "Ts", "Th"],
      heroCards: ["Kc", "Qd"],
      potTotal: 37418,
      seats: [
        { label: "Hero", position: "HJ", positionName: "HJ", startingStack: 17989 },
        { label: "Player 2", position: "CO", positionName: "CO", startingStack: 28668, shownCards: ["Ah", "Ad"] },
        { label: "Player 3", position: "BTN", positionName: "BTN", startingStack: 10788 },
        { label: "Player 4", position: "SB", positionName: "SB", startingStack: 20930 },
        { label: "Player 5", position: "BB", positionName: "BB", startingStack: 9808 },
        { label: "Player 6", position: "EARLY", positionName: "UTG", startingStack: 34472 },
        { label: "Player 7", position: "EARLY", positionName: "UTG+1", startingStack: 17116 },
        { label: "Player 8", position: "EARLY", positionName: "LJ", startingStack: 149114 },
      ],
      actions: [
        { street: "PREFLOP", actor: "Hero", action: "POST_ANTE", amount: 90 },
        { street: "PREFLOP", actor: "Player 3", action: "POST_ANTE", amount: 90 },
        { street: "PREFLOP", actor: "Player 6", action: "POST_ANTE", amount: 90 },
        { street: "PREFLOP", actor: "Player 4", action: "POST_ANTE", amount: 90 },
        { street: "PREFLOP", actor: "Player 8", action: "POST_ANTE", amount: 90 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_ANTE", amount: 90 },
        { street: "PREFLOP", actor: "Player 5", action: "POST_ANTE", amount: 90 },
        { street: "PREFLOP", actor: "Player 7", action: "POST_ANTE", amount: 90 },
        { street: "PREFLOP", actor: "Player 4", action: "POST_SB", amount: 300 },
        { street: "PREFLOP", actor: "Player 5", action: "POST_BB", amount: 600 },
        { street: "PREFLOP", actor: "Player 6", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 7", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 8", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1200 },
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 4215 },
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 4", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 5", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 17899 },
        { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 13684 },
      ],
    };
    expect(detectHeroOpenFacedThreeBet(s)).toEqual({
      threebetterSeatLabel: "Player 2",
      threebetterPosition: "CO",
      heroAction: "ALL_IN",
    });
  });

  it("никто не 3-бетнул (все сбросили на опен) → null", () => {
    const s = snap({
      heroOpen: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1200 },
      after: [
        { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "SBP", action: "FOLD" },
        { street: "PREFLOP", actor: "BBP", action: "FOLD" },
      ],
    });
    expect(detectHeroOpenFacedThreeBet(s)).toBeNull();
  });

  it("флэт-колл перед 3-бетом (сквиз-спот) → null, не наш чарт", () => {
    const s = snap({
      heroOpen: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1200 },
      after: [
        { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 1200 },
        { street: "PREFLOP", actor: "Player 3", action: "RAISE", amount: 5000 },
      ],
    });
    expect(detectHeroOpenFacedThreeBet(s)).toBeNull();
  });

  it("второй рейз не от Hero (сквиз/4-бет со стороны) → null", () => {
    const s = snap({
      heroOpen: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1200 },
      after: [
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 4215 },
        { street: "PREFLOP", actor: "Player 3", action: "RAISE", amount: 9000 },
      ],
    });
    expect(detectHeroOpenFacedThreeBet(s)).toBeNull();
  });

  it("лимпер до открытия Hero → не открытие, null", () => {
    const s: TableSnapshot = {
      seats: [
        { label: "Limper", position: "EARLY", positionName: "UTG", startingStack: 4000 },
        { label: "Hero", position: "HJ", positionName: "HJ", startingStack: 4000 },
        { label: "Player 2", position: "CO", positionName: "CO", startingStack: 4000 },
      ],
      heroCards: ["Kc", "Qd"],
      board: [],
      potTotal: 0,
      actions: [
        { street: "PREFLOP", actor: "Limper", action: "CALL", amount: 100 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 400 },
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 1200 },
        { street: "PREFLOP", actor: "Hero", action: "FOLD" },
      ],
    };
    expect(detectHeroOpenFacedThreeBet(s)).toBeNull();
  });

  it("3-бетующий — BB: объект возвращается, но позиция null (свой чарт защиты BB)", () => {
    const s = snap({
      heroOpen: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1200 },
      after: [
        { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "SBP", action: "FOLD" },
        { street: "PREFLOP", actor: "BBP", action: "RAISE", amount: 4000 },
        { street: "PREFLOP", actor: "Hero", action: "FOLD" },
      ],
    });
    expect(detectHeroOpenFacedThreeBet(s)).toEqual({
      threebetterSeatLabel: "BBP",
      threebetterPosition: null,
      heroAction: "FOLD",
    });
  });

  it("Hero не открывался первым (рейз впереди) → null", () => {
    const s = snap({
      heroOpen: { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 250 },
      after: [],
      threebetterCoarse: "EARLY",
      threebetterName: "UTG",
    });
    // Player 2 (UTG) рейзит ДО открытия Hero — переставим порядок вручную.
    const reordered: TableSnapshot = {
      ...s,
      actions: [
        { street: "PREFLOP", actor: "SBP", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "BBP", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 250 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 250 },
      ],
    };
    expect(detectHeroOpenFacedThreeBet(reordered)).toBeNull();
  });
});

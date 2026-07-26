import { describe, it, expect } from "vitest";
import type { TableAction, TableSnapshot } from "@/parser/types";
import { detectHeroFacedFourBet } from "@/parser/vs-fourbet-faced";

// Стол: опенер (Player 2) открывается, дальше настраиваемая цепочка действий
// (сквиз-сетап опционален), рейз Hero, всё, что происходит после (4-бет, фолды,
// финальный ответ Hero) — целиком в afterHeroRaise, порядок действий как в реальной раздаче.
function snap(opts: {
  heroCards?: string[];
  openerCoarse?: TableSnapshot["seats"][number]["position"];
  openerName?: string;
  preHeroActions: TableAction[]; // опен опенера + сквиз-сетап (коллеры/фолды)
  heroRaise: TableAction;
  afterHeroRaise: TableAction[]; // 4-бет, фолды остальных, финальный ответ Hero
}): TableSnapshot {
  return {
    seats: [
      { label: "Player 2", position: opts.openerCoarse ?? "EARLY", positionName: opts.openerName ?? "MP", startingStack: 4000 },
      { label: "Player 3", position: "CO", positionName: "CO", startingStack: 4000 },
      { label: "Player 4", position: "BTN", positionName: "BTN", startingStack: 4000 },
      { label: "SBP", position: "SB", startingStack: 4000 },
      { label: "Hero", position: "BB", positionName: "BB", startingStack: 4000 },
    ],
    heroCards: opts.heroCards ?? ["9c", "9d"],
    board: [],
    actions: [
      { street: "PREFLOP", actor: "SBP", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 100 },
      ...opts.preHeroActions,
      opts.heroRaise,
      ...opts.afterHeroRaise,
    ],
    potTotal: 0,
  };
}

describe("detectHeroFacedFourBet — Hero (3-бет/сквиз) получил 4-бет от опенера", () => {
  it("чистый 3-бет vs 4-бет (без сквиза): MP открылся, Hero 3-бетнул, MP 4-бетит, Hero шовит", () => {
    const s = snap({
      preHeroActions: [
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 200 },
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 4", action: "FOLD" },
        { street: "PREFLOP", actor: "SBP", action: "FOLD" },
      ],
      heroRaise: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1000 },
      afterHeroRaise: [
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 2290 },
        { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 3900 },
      ],
    });
    expect(detectHeroFacedFourBet(s)).toEqual({
      openerSeatLabel: "Player 2",
      openerPosition: "MP",
      heroAction: "ALL_IN",
    });
  });

  it("сквиз vs 4-бет — реконструкция реальной раздачи (99 на BB сквизует над MP+2 коллерами, MP 4-бетит, Hero шовит)", () => {
    const s: TableSnapshot = {
      seats: [
        { label: "Player 2", position: "EARLY", positionName: "MP", startingStack: 540 }, // ~5.4bb после раздачи
        { label: "Player 3", position: "CO", positionName: "CO", startingStack: 6630 },
        { label: "Player 4", position: "BTN", positionName: "BTN", startingStack: 6600 },
        { label: "SBP", position: "SB", startingStack: 8790 },
        { label: "Hero", position: "BB", positionName: "BB", startingStack: 8790 },
      ],
      heroCards: ["9s", "9d"],
      board: [],
      actions: [
        { street: "PREFLOP", actor: "SBP", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 200 }, // опен 2bb
        { street: "PREFLOP", actor: "Player 3", action: "CALL", amount: 200 }, // коллер 1
        { street: "PREFLOP", actor: "Player 4", action: "CALL", amount: 200 }, // коллер 2 (BTN)
        { street: "PREFLOP", actor: "SBP", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1000 }, // сквиз до 10bb
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 2290 }, // 4-бет опенера до 22.9bb
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 4", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 7780 }, // шов 77.8bb
      ],
      potTotal: 16120,
    };
    expect(detectHeroFacedFourBet(s)).toEqual({
      openerSeatLabel: "Player 2",
      openerPosition: "MP",
      heroAction: "ALL_IN",
    });
  });

  it("4-бет пришёл НЕ от исходного опенера (коллер решил рейзить вместо ответа на сквиз) → null", () => {
    const s = snap({
      preHeroActions: [
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 200 },
        { street: "PREFLOP", actor: "Player 3", action: "CALL", amount: 200 },
        { street: "PREFLOP", actor: "Player 4", action: "FOLD" },
        { street: "PREFLOP", actor: "SBP", action: "FOLD" },
      ],
      heroRaise: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1000 },
      afterHeroRaise: [
        { street: "PREFLOP", actor: "Player 3", action: "RAISE", amount: 2290 },
        { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "FOLD" },
      ],
    });
    expect(detectHeroFacedFourBet(s)).toBeNull();
  });

  it("Hero сама открылась первой → null (это спот def-vs-3bet.ts)", () => {
    const s: TableSnapshot = {
      seats: [
        { label: "Hero", position: "CO", positionName: "CO", startingStack: 4000 },
        { label: "Player 2", position: "BTN", positionName: "BTN", startingStack: 4000 },
        { label: "SBP", position: "SB", startingStack: 4000 },
        { label: "BBP", position: "BB", startingStack: 4000 },
      ],
      heroCards: ["9c", "9d"],
      board: [],
      actions: [
        { street: "PREFLOP", actor: "SBP", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "BBP", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 },
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 900 },
        { street: "PREFLOP", actor: "SBP", action: "FOLD" },
        { street: "PREFLOP", actor: "BBP", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 650 },
      ],
      potTotal: 0,
    };
    expect(detectHeroFacedFourBet(s)).toBeNull();
  });

  it("второй рейз (5-бет) до ответа Hero → null", () => {
    const s = snap({
      preHeroActions: [
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 200 },
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 4", action: "FOLD" },
        { street: "PREFLOP", actor: "SBP", action: "FOLD" },
      ],
      heroRaise: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1000 },
      afterHeroRaise: [
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 2290 },
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 4000 },
      ],
    });
    expect(detectHeroFacedFourBet(s)).toBeNull();
  });

  it("Hero отвечает фолдом на 4-бет — тоже наш спот, судим действие как есть", () => {
    const s = snap({
      preHeroActions: [
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 200 },
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 4", action: "FOLD" },
        { street: "PREFLOP", actor: "SBP", action: "FOLD" },
      ],
      heroRaise: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1000 },
      afterHeroRaise: [
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 2290 },
        { street: "PREFLOP", actor: "Hero", action: "FOLD" },
      ],
    });
    expect(detectHeroFacedFourBet(s)).toEqual({
      openerSeatLabel: "Player 2",
      openerPosition: "MP",
      heroAction: "FOLD",
    });
  });

  it("опенер вне чарта позиций (BB открылся рейзом) → openerPosition null", () => {
    const s: TableSnapshot = {
      seats: [
        { label: "Player 2", position: "BB", positionName: "BB", startingStack: 4000 },
        { label: "Hero", position: "CO", positionName: "CO", startingStack: 4000 },
      ],
      heroCards: ["9c", "9d"],
      board: [],
      actions: [
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 250 }, // BB открылся рейзом (изолированный кейс)
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 900 },
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 2000 },
        { street: "PREFLOP", actor: "Hero", action: "FOLD" },
      ],
      potTotal: 0,
    };
    expect(detectHeroFacedFourBet(s)).toEqual({
      openerSeatLabel: "Player 2",
      openerPosition: null,
      heroAction: "FOLD",
    });
  });

  it("никто не 4-бетит (опенер сбросил на сквиз) → null", () => {
    const s = snap({
      preHeroActions: [
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 200 },
        { street: "PREFLOP", actor: "Player 3", action: "CALL", amount: 200 },
        { street: "PREFLOP", actor: "Player 4", action: "FOLD" },
        { street: "PREFLOP", actor: "SBP", action: "FOLD" },
      ],
      heroRaise: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1000 },
      afterHeroRaise: [
        { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      ],
    });
    expect(detectHeroFacedFourBet(s)).toBeNull();
  });
});

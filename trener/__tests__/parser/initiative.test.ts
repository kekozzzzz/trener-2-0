import { describe, it, expect } from "vitest";
import type { Position, Street, TableAction, TableSnapshot } from "@/parser/types";
import { currentAggressor, gaveBackInitiative, renderInitiative, renderTacticalMarks } from "@/parser/initiative";

const A = (street: Street, actor: string, action: TableAction["action"], amount?: number): TableAction =>
  ({ street, actor, action, amount });

function snap(heroPos: Position, board: string[], actions: TableAction[]): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: heroPos, positionName: heroPos, startingStack: 5000, seatNumber: 1 },
      { label: "Player 1", position: "BB", positionName: "BB", startingStack: 5000, seatNumber: 2 },
      { label: "SBp", position: "SB", positionName: "SB", startingStack: 5000, seatNumber: 3 },
    ],
    heroCards: ["Ac", "Kd"],
    board,
    tableSize: 3,
    buttonSeat: 1,
    potTotal: 0,
    actions,
  };
}

const heroOpens = [
  A("PREFLOP", "SBp", "POST_SB", 50),
  A("PREFLOP", "Player 1", "POST_BB", 100),
  A("PREFLOP", "Hero", "RAISE", 250),
  A("PREFLOP", "SBp", "FOLD"),
  A("PREFLOP", "Player 1", "CALL", 150),
];
const board4 = ["Ks", "9h", "3d", "7c"];

describe("currentAggressor", () => {
  it("до флопа инициатива у префлоп-рейзера (Hero)", () => {
    const s = snap("CO", board4, heroOpens);
    expect(currentAggressor(s, "FLOP")).toBe("Hero");
  });

  it("донк/бет на флопе перехватывает инициативу", () => {
    const s = snap("CO", board4, [...heroOpens, A("FLOP", "Player 1", "BET", 150), A("FLOP", "Hero", "CALL", 150)]);
    expect(currentAggressor(s, "TURN")).toBe("Player 1");
  });
});

describe("gaveBackInitiative — взял лид и сдал", () => {
  it("c-bet флопа, чек тёрна → сдал инициативу", () => {
    const s = snap("CO", board4, [
      ...heroOpens,
      A("FLOP", "Player 1", "CHECK"), A("FLOP", "Hero", "BET", 200), A("FLOP", "Player 1", "CALL", 200),
      A("TURN", "Player 1", "CHECK"), A("TURN", "Hero", "CHECK"),
    ]);
    const reads = gaveBackInitiative(s);
    expect(reads).toHaveLength(1);
    expect(reads[0].street).toBe("TURN");
    expect(reads[0].foldsNeededPct).toBeGreaterThan(0);
  });

  it("чек-рейз флопа, чек тёрна → сдал инициативу", () => {
    const s = snap("SB", board4, [
      A("PREFLOP", "Hero", "POST_SB", 50), A("PREFLOP", "Player 1", "POST_BB", 100),
      A("PREFLOP", "Hero", "RAISE", 250), A("PREFLOP", "Player 1", "CALL", 150),
      A("FLOP", "Hero", "CHECK"), A("FLOP", "Player 1", "BET", 200), A("FLOP", "Hero", "RAISE", 600), A("FLOP", "Player 1", "CALL", 400),
      A("TURN", "Hero", "CHECK"),
    ]);
    expect(gaveBackInitiative(s)).toHaveLength(1);
  });

  it("продолжил баррель тёрна (бет) → инициативу не сдал", () => {
    const s = snap("CO", board4, [
      ...heroOpens,
      A("FLOP", "Player 1", "CHECK"), A("FLOP", "Hero", "BET", 200), A("FLOP", "Player 1", "CALL", 200),
      A("TURN", "Player 1", "CHECK"), A("TURN", "Hero", "BET", 400),
    ]);
    expect(gaveBackInitiative(s)).toHaveLength(0);
  });

  it("инициатива не у Hero (соперник c-betил) → молчим", () => {
    const s = snap("BB", board4, [
      A("PREFLOP", "SBp", "POST_SB", 50), A("PREFLOP", "Hero", "POST_BB", 100),
      A("PREFLOP", "Player 1", "RAISE", 250), A("PREFLOP", "SBp", "FOLD"), A("PREFLOP", "Hero", "CALL", 150),
      A("FLOP", "Hero", "CHECK"), A("FLOP", "Player 1", "BET", 200), A("FLOP", "Hero", "CALL", 200),
      A("TURN", "Hero", "CHECK"),
    ]);
    expect(gaveBackInitiative(s)).toHaveLength(0);
  });
});

describe("renderInitiative — инициатива по улицам строкой для промпта", () => {
  it("префлоп-агрессор Hero, соперник забрал лид бетом на флопе", () => {
    const s = snap("CO", ["Kh", "7c", "2d", "9s"], [
      ...heroOpens,
      A("FLOP", "Player 1", "BET", 200),
      A("FLOP", "Hero", "CALL", 200),
      A("TURN", "Player 1", "BET", 400),
    ]);
    const out = renderInitiative(s);
    expect(out).toContain("префлоп инициативу взял ты");
    expect(out).toContain("входя в тёрне - у BB");
  });

  it("лимпованный банк (никто не рейзил) — инициативы ни у кого", () => {
    const s = snap("SB", ["Kh", "7c", "2d"], [
      A("PREFLOP", "Hero", "POST_SB", 50),
      A("PREFLOP", "Player 1", "POST_BB", 100),
      A("PREFLOP", "Hero", "CALL", 50),
      A("PREFLOP", "Player 1", "CHECK"),
      A("FLOP", "Hero", "CHECK"),
      A("FLOP", "Player 1", "CHECK"),
    ]);
    expect(renderInitiative(s)).toContain("никто не рейзил");
  });

  it("до флопа — пусто", () => {
    const s = snap("CO", [], heroOpens);
    expect(renderInitiative(s)).toBe("");
  });
});

describe("renderTacticalMarks — c-bet и чек-рейз метки", () => {
  it("c-bet: префлоп-агрессор Hero ставит первым на флопе", () => {
    const s = snap("CO", ["Kh", "7c", "2d"], [
      ...heroOpens,
      A("FLOP", "Player 1", "CHECK"),
      A("FLOP", "Hero", "BET", 200),
    ]);
    expect(renderTacticalMarks(s)).toContain("c-bet");
    expect(renderTacticalMarks(s)).toContain("поставил ты");
  });

  it("чек-рейз соперника: он чекнул, Hero поставил, он поднял", () => {
    const s = snap("CO", ["Kh", "7c", "2d"], [
      ...heroOpens,
      A("FLOP", "Player 1", "CHECK"),
      A("FLOP", "Hero", "BET", 200),
      A("FLOP", "Player 1", "RAISE", 700),
    ]);
    const out = renderTacticalMarks(s);
    expect(out).toContain("чек-рейз на флопе");
    expect(out).toContain("BB");
  });

  it("нет тактических паттернов — пусто", () => {
    const s = snap("CO", ["Kh", "7c", "2d"], [
      ...heroOpens,
      A("FLOP", "Player 1", "CHECK"),
      A("FLOP", "Hero", "CHECK"),
    ]);
    expect(renderTacticalMarks(s)).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import type { Position, Street, TableAction, TableSnapshot } from "@/parser/types";
import { currentAggressor, gaveBackInitiative, renderInitiative, renderTacticalMarks, donkLeads, facingDonk } from "@/parser/initiative";

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

  // Аудит румов 18.07: румы пишут КОЛЛ ва-банк тем же action="ALL_IN", что и пуш. Чек-КОЛЛ олл-ина
  // чек-рейзом НЕ является — раньше метка выходила и на нём (ложный тактический факт для модели).
  it("чек-КОЛЛ олл-ина (доложил меньше ставки) — это НЕ чек-рейз", () => {
    const s = snap("CO", ["Kh", "7c", "2d"], [
      ...heroOpens,
      A("FLOP", "Player 1", "CHECK"),
      A("FLOP", "Hero", "BET", 2000),
      A("FLOP", "Player 1", "ALL_IN", 1500), // доложил МЕНЬШЕ ставки Hero = колл ва-банк
    ]);
    // Проверяем именно МЕТКУ, а не слово: в шапке строки «чек-рейз» есть всегда («c-bet/чек-рейз
    // бери отсюда»), поэтому голое not.toContain("чек-рейз") дало бы ложное падение.
    expect(renderTacticalMarks(s)).not.toContain("чек-рейз на флопе");
  });

  // А настоящий чек-рейз олл-ином метиться обязан (не пересушили проверку).
  it("чек-рейз ОЛЛ-ИНОМ поверх ставки — метка есть", () => {
    const s = snap("CO", ["Kh", "7c", "2d"], [
      ...heroOpens,
      A("FLOP", "Player 1", "CHECK"),
      A("FLOP", "Hero", "BET", 200),
      A("FLOP", "Player 1", "ALL_IN", 1800), // подняли ВЫШЕ ставки = настоящий чек-рейз
    ]);
    expect(renderTacticalMarks(s)).toContain("чек-рейз на флопе");
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

/**
 * Донк = ставка БЕЗ инициативы (первым в агрессора). Поймал Артём 2026-07-17:
 * тренер писал «ты донкнул в агрессора на ривере после того, как он прочекал тёрн» — фраза сама
 * себе противоречит. Прочекал = инициативу ОТДАЛ, и ставка первым на ривере это уже обычный лид.
 * Причина: currentAggressor отдаёт агрессора ЛЮБОЙ прошлой улицы, а не непосредственно предыдущей.
 */
describe("донк только при СВЕЖЕЙ инициативе соперника", () => {
  it("агрессор флопа ПРОЧЕКАЛ тёрн → ставка Hero на ривере это НЕ донк", () => {
    const s = snap("BB", ["2c", "7h", "Kd", "3s", "9h"], [
      A("PREFLOP", "Player 1", "RAISE", 60),
      A("PREFLOP", "Hero", "CALL", 40),
      A("FLOP", "Hero", "CHECK"),
      A("FLOP", "Player 1", "BET", 60),   // агрессор флопа — соперник
      A("FLOP", "Hero", "CALL", 60),
      A("TURN", "Hero", "CHECK"),
      A("TURN", "Player 1", "CHECK"),      // ОТДАЛ инициативу
      A("RIVER", "Hero", "BET", 100),      // это ЛИД, не донк
    ]);
    expect(donkLeads(s).some((d) => d.street === "RIVER")).toBe(false);
  });

  it("агрессор тёрна поставил тёрн → ставка Hero первым на ривере это ДОНК", () => {
    const s = snap("BB", ["2c", "7h", "Kd", "3s", "9h"], [
      A("PREFLOP", "Player 1", "RAISE", 60),
      A("PREFLOP", "Hero", "CALL", 40),
      A("FLOP", "Hero", "CHECK"),
      A("FLOP", "Player 1", "BET", 60),
      A("FLOP", "Hero", "CALL", 60),
      A("TURN", "Hero", "CHECK"),
      A("TURN", "Player 1", "BET", 120),   // инициатива СВЕЖАЯ
      A("TURN", "Hero", "CALL", 120),
      A("RIVER", "Hero", "BET", 200),      // донк
    ]);
    expect(donkLeads(s).some((d) => d.street === "RIVER")).toBe(true);
  });

  it("донк в Hero: Hero прочекал тёрн → ставка соперника на ривере НЕ донк в него", () => {
    const s = snap("BTN", ["2c", "7h", "Kd", "3s", "9h"], [
      A("PREFLOP", "Hero", "RAISE", 60),
      A("PREFLOP", "Player 1", "CALL", 40),
      A("FLOP", "Player 1", "CHECK"),
      A("FLOP", "Hero", "BET", 60),        // агрессор — Hero
      A("FLOP", "Player 1", "CALL", 60),
      A("TURN", "Player 1", "CHECK"),
      A("TURN", "Hero", "CHECK"),          // Hero ОТДАЛ инициативу
      A("RIVER", "Player 1", "BET", 100),  // лид, не донк в Hero
    ]);
    expect(facingDonk(s).some((d) => d.street === "RIVER")).toBe(false);
  });

  it("классический донк на флопе (префлоп-агрессор — соперник) остаётся донком", () => {
    const s = snap("BB", ["2c", "7h", "Kd"], [
      A("PREFLOP", "Player 1", "RAISE", 60),
      A("PREFLOP", "Hero", "CALL", 40),
      A("FLOP", "Hero", "BET", 60),        // донк в префлоп-агрессора
    ]);
    expect(donkLeads(s).some((d) => d.street === "FLOP")).toBe(true);
  });
});

// Артём 19.07: тренер написал «когда агрессор чекает флоп, он признаёт слабость диапазона — туза
// или короля у него редко будет» и на этом построил совет коллировать. Но чек агрессора —
// ДВУСТОРОННЯЯ линия: там и отказ от банка, и придержанная сильная рука. На микролимитах такая
// ловушка обычное дело. Парсер теперь размечает линию и прямо запрещает читать её как слабость.
describe("renderTacticalMarks — отложенный контбет не читается как слабость", () => {
  const heroOpensBb: TableAction[] = [
    A("PREFLOP", "Hero", "POST_BB", 300),
    A("PREFLOP", "Player 1", "RAISE", 700),
    A("PREFLOP", "Hero", "CALL", 400),
  ];

  it("агрессор чекнул флоп и поставил тёрн → метка с запретом читать чек как слабость", () => {
    const s = snap("BB", ["Ks", "As", "5d", "9d"], [
      ...heroOpensBb,
      A("FLOP", "Hero", "CHECK"),
      A("FLOP", "Player 1", "CHECK"),
      A("TURN", "Hero", "CHECK"),
      A("TURN", "Player 1", "BET", 870),
    ]);
    const out = renderTacticalMarks(s);
    expect(out).toContain("отложенный контбет");
    expect(out).toContain("НЕЛЬЗЯ читать как признание слабости");
    expect(out).toContain("придержанная сильная рука");
  });

  it("обычный контбет флопа меткой отложенного НЕ помечается", () => {
    const s = snap("BB", ["Ks", "As", "5d", "9d"], [
      ...heroOpensBb,
      A("FLOP", "Hero", "CHECK"),
      A("FLOP", "Player 1", "BET", 400),
      A("FLOP", "Hero", "CALL", 400),
      A("TURN", "Hero", "CHECK"),
      A("TURN", "Player 1", "BET", 870),
    ]);
    const out = renderTacticalMarks(s);
    expect(out).toContain("c-bet");
    expect(out).not.toContain("отложенный контбет");
  });

  it("ставит на тёрне НЕ префлоп-агрессор → это не отложенный контбет", () => {
    const s = snap("BB", ["Ks", "As", "5d", "9d"], [
      ...heroOpensBb,
      A("FLOP", "Hero", "CHECK"),
      A("FLOP", "Player 1", "CHECK"),
      A("TURN", "Hero", "BET", 500), // лидирует сам Hero
    ]);
    expect(renderTacticalMarks(s)).not.toContain("отложенный контбет");
  });
});

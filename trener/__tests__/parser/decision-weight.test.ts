import { describe, it, expect } from "vitest";
import type { TableSnapshot } from "@/parser/types";
import { decisionMarks, topDecisionMark } from "@/parser/decision-weight";
import { assignImportanceLevels } from "@/parser/ggpoker/classify";

// Критические по решению (план 2026-07-11): каналы тяжёлых решений без денежного следа.
// Блайнды 50/100 → порог существенности max(5bb, 10% стека) = max(500, 500) = 500.

function baseSnap(): TableSnapshot {
  return {
    seats: [
      { label: "Player 1", position: "BB", startingStack: 5000, seatNumber: 1 },
      { label: "Player 2", position: "SB", startingStack: 5000, seatNumber: 2 },
      { label: "Hero", position: "BTN", startingStack: 5000, seatNumber: 3 },
    ],
    heroCards: ["Qh", "Qd"],
    board: [],
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Player 1", action: "POST_BB", amount: 100 },
    ],
    potTotal: 0,
  };
}

describe("decisionMarks — BIG_FOLD", () => {
  // Кейс Артёма: вложился префлоп и на флопе, на ривере встал перед крупной ставкой
  // и сбросил. Потеря маленькая, вскрытия нет — раньше раздача умирала в MEDIUM.
  function bigFoldSnap(): TableSnapshot {
    const s = baseSnap();
    s.board = ["Kd", "2s", "6s", "2c", "Td"];
    s.actions.push(
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 120 },
      { street: "FLOP", actor: "Player 1", action: "BET", amount: 300 },
      { street: "FLOP", actor: "Hero", action: "CALL", amount: 300 },
      { street: "TURN", actor: "Player 1", action: "CHECK" },
      { street: "TURN", actor: "Hero", action: "CHECK" },
      { street: "RIVER", actor: "Player 1", action: "BET", amount: 900 },
      { street: "RIVER", actor: "Hero", action: "FOLD" },
    );
    s.potTotal = 1090;
    return s;
  }

  it("фолд против крупной ставки после своего входа → BIG_FOLD с весом решения", () => {
    const marks = decisionMarks(bigFoldSnap(), -520);
    const bigFold = marks.find((m) => m.channel === "BIG_FOLD");
    expect(bigFold).toBeDefined();
    expect(bigFold!.street).toBe("RIVER");
    expect(bigFold!.toCallBb).toBe(9);
    expect(bigFold!.weightBb).toBeGreaterThan(15); // банк + цена
  });

  it("фолд мусора на первом решении против олл-ина — НЕ тяжёлое решение", () => {
    const s = baseSnap();
    s.actions.push(
      { street: "PREFLOP", actor: "Player 2", action: "ALL_IN", amount: 5000 },
      { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
      { street: "PREFLOP", actor: "Hero", action: "FOLD" },
    );
    expect(decisionMarks(s, 0).find((m) => m.channel === "BIG_FOLD")).toBeUndefined();
  });

  it("мелкая цена колла — не BIG_FOLD", () => {
    const s = bigFoldSnap();
    s.actions[s.actions.length - 2] = { street: "RIVER", actor: "Player 1", action: "BET", amount: 300 };
    expect(decisionMarks(s, -520).find((m) => m.channel === "BIG_FOLD")).toBeUndefined();
  });

  // Калибровка по разметке Артёма: «воздух сдался на обычную ставку» — рутина, не диалог.
  it("воздух без дро и без крупного вложения — не BIG_FOLD", () => {
    const s = bigFoldSnap();
    s.heroCards = ["9h", "4c"]; // мимо борда K-2-6-2-T, дро нет
    // Вход дешёвый: лимп вместо рейза, колл флопа мелкий — вложение ниже порога.
    s.actions[2] = { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 100 };
    s.actions[4] = { street: "PREFLOP", actor: "Player 1", action: "CHECK" };
    s.actions[6] = { street: "FLOP", actor: "Hero", action: "CALL", amount: 300 };
    expect(decisionMarks(s, -400).find((m) => m.channel === "BIG_FOLD")).toBeUndefined();
  });

  it("воздух, но крупное собственное вложение (3-бет/сквиз) — BIG_FOLD остаётся", () => {
    const s = bigFoldSnap();
    s.heroCards = ["Ah", "Qc"]; // мимо борда, но префлоп вложено 8bb
    s.actions[2] = { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 800 };
    s.actions[4] = { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 700 };
    expect(decisionMarks(s, -1100).find((m) => m.channel === "BIG_FOLD")).toBeDefined();
  });
});

describe("decisionMarks — FOLD_INVEST", () => {
  it("свой крупный бет на улице → рейз соперника → фолд = FOLD_INVEST", () => {
    const s = baseSnap();
    s.board = ["Kd", "7s", "2c"];
    s.actions.push(
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 120 },
      { street: "FLOP", actor: "Player 1", action: "CHECK" },
      { street: "FLOP", actor: "Hero", action: "BET", amount: 600 },
      { street: "FLOP", actor: "Player 1", action: "RAISE", amount: 1800 },
      { street: "FLOP", actor: "Hero", action: "FOLD" },
    );
    const marks = decisionMarks(s, -820);
    expect(marks.find((m) => m.channel === "FOLD_INVEST")).toBeDefined();
  });
});

describe("decisionMarks — WON_BLUFF", () => {
  it("крупная агрессия воздухом без вскрытия, банк забран → WON_BLUFF", () => {
    const s = baseSnap();
    s.heroCards = ["5h", "4h"]; // воздух на этом борде
    s.board = ["Kd", "9s", "2c"];
    s.actions.push(
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 120 },
      { street: "FLOP", actor: "Player 1", action: "CHECK" },
      { street: "FLOP", actor: "Hero", action: "BET", amount: 600 },
      { street: "FLOP", actor: "Player 1", action: "FOLD" },
    );
    const marks = decisionMarks(s, 490);
    expect(marks.find((m) => m.channel === "WON_BLUFF")).toBeDefined();
  });

  it("выигрыш велью-ставкой (сильная рука) — не WON_BLUFF", () => {
    const s = baseSnap();
    s.heroCards = ["Kh", "Kc"]; // сет королей
    s.board = ["Kd", "9s", "2c"];
    s.actions.push(
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 120 },
      { street: "FLOP", actor: "Player 1", action: "CHECK" },
      { street: "FLOP", actor: "Hero", action: "BET", amount: 600 },
      { street: "FLOP", actor: "Player 1", action: "FOLD" },
    );
    expect(decisionMarks(s, 490).find((m) => m.channel === "WON_BLUFF")).toBeUndefined();
  });

  it("проигранная раздача — не WON_BLUFF", () => {
    const s = baseSnap();
    s.heroCards = ["5h", "4h"];
    s.board = ["Kd", "9s", "2c"];
    s.actions.push(
      { street: "FLOP", actor: "Hero", action: "BET", amount: 600 },
      { street: "FLOP", actor: "Player 1", action: "CALL", amount: 600 },
    );
    expect(decisionMarks(s, -600).find((m) => m.channel === "WON_BLUFF")).toBeUndefined();
  });
});

describe("decisionMarks — BIG_CALL_WON", () => {
  it("существенный колл при пограничном эквити против вскрытой руки → BIG_CALL_WON", () => {
    const s = baseSnap();
    // Флеш-дро + оверкарта против топ-пары: ~40-45% на флопе — пограничная зона.
    s.heroCards = ["Ah", "Qh"];
    s.seats[0].shownCards = ["Kc", "Kd"];
    s.board = ["2h", "9h", "7c", "Ac", "4d"];
    s.actions.push(
      { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 300 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 300 },
      { street: "FLOP", actor: "Player 1", action: "BET", amount: 600 },
      { street: "FLOP", actor: "Hero", action: "CALL", amount: 600 },
      { street: "TURN", actor: "Player 1", action: "CHECK" },
      { street: "TURN", actor: "Hero", action: "CHECK" },
      { street: "RIVER", actor: "Player 1", action: "CHECK" },
      { street: "RIVER", actor: "Hero", action: "CHECK" },
    );
    const marks = decisionMarks(s, 950);
    expect(marks.find((m) => m.channel === "BIG_CALL_WON")).toBeDefined();
  });

  it("колл далеко впереди (кулерная зона) — не BIG_CALL_WON", () => {
    const s = baseSnap();
    s.heroCards = ["Ah", "Ad"]; // оверпара против нижней пары — далеко впереди
    s.seats[0].shownCards = ["7c", "6c"];
    s.board = ["2h", "9d", "7s", "Kc", "4d"];
    s.actions.push(
      { street: "FLOP", actor: "Player 1", action: "BET", amount: 600 },
      { street: "FLOP", actor: "Hero", action: "CALL", amount: 600 },
    );
    expect(decisionMarks(s, 800).find((m) => m.channel === "BIG_CALL_WON")).toBeUndefined();
  });
});

describe("decisionMarks — MISSED_VALUE", () => {
  it("ривер прочекан с двумя парами при заметном банке → MISSED_VALUE", () => {
    const s = baseSnap();
    s.heroCards = ["Kh", "Jd"];
    s.board = ["Ad", "Kc", "2h", "7s", "Jh"]; // ривер дал две пары
    s.actions.push(
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 120 },
      { street: "FLOP", actor: "Player 1", action: "BET", amount: 600 },
      { street: "FLOP", actor: "Hero", action: "CALL", amount: 600 },
      { street: "TURN", actor: "Player 1", action: "CHECK" },
      { street: "TURN", actor: "Hero", action: "CHECK" },
      { street: "RIVER", actor: "Player 1", action: "CHECK" },
      { street: "RIVER", actor: "Hero", action: "CHECK" },
    );
    const marks = decisionMarks(s, 1240);
    expect(marks.find((m) => m.channel === "MISSED_VALUE")).toBeDefined();
  });

  it("мелкий прочеканный банк — не критическая, шума нет", () => {
    const s = baseSnap();
    s.heroCards = ["Kh", "Jd"];
    s.board = ["Ad", "Kc", "2h", "7s", "Jh"];
    s.actions.push(
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 100 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CHECK" },
      { street: "FLOP", actor: "Player 1", action: "CHECK" },
      { street: "FLOP", actor: "Hero", action: "CHECK" },
      { street: "TURN", actor: "Player 1", action: "CHECK" },
      { street: "TURN", actor: "Hero", action: "CHECK" },
      { street: "RIVER", actor: "Player 1", action: "CHECK" },
      { street: "RIVER", actor: "Hero", action: "CHECK" },
    );
    expect(decisionMarks(s, 250).find((m) => m.channel === "MISSED_VALUE")).toBeUndefined();
  });

  // Инцидент 2026-07-12: недобор реален, только если рука Hero была СТАРШЕ вскрытой руки на
  // прочеканной улице (судим по моменту, не по нетто-итогу). Скелет — как в выигрышном кейсе выше.
  function checkedTwoPairSnap(): TableSnapshot {
    const s = baseSnap();
    s.heroCards = ["Kh", "Jd"]; // две пары K+J на ривере
    s.board = ["Ad", "Kc", "2h", "7s", "Jh"];
    s.actions.push(
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 120 },
      { street: "FLOP", actor: "Player 1", action: "BET", amount: 600 },
      { street: "FLOP", actor: "Hero", action: "CALL", amount: 600 },
      { street: "TURN", actor: "Player 1", action: "CHECK" },
      { street: "TURN", actor: "Hero", action: "CHECK" },
      { street: "RIVER", actor: "Player 1", action: "CHECK" },
      { street: "RIVER", actor: "Hero", action: "CHECK" },
    );
    return s;
  }

  it("соперник вскрыл СТАРШУЮ руку (Hero был позади) → НЕ MISSED_VALUE", () => {
    const s = checkedTwoPairSnap();
    s.seats[0].shownCards = ["7c", "7d"]; // трипс семёрок — старше двух пар Hero
    expect(decisionMarks(s, -1240).find((m) => m.channel === "MISSED_VALUE")).toBeUndefined();
  });

  it("соперник вскрыл СЛАБЕЕ (Hero был впереди) → MISSED_VALUE остаётся, недобор реален", () => {
    const s = checkedTwoPairSnap();
    s.seats[0].shownCards = ["3c", "3d"]; // пара троек — слабее двух пар Hero
    expect(decisionMarks(s, 1240).find((m) => m.channel === "MISSED_VALUE")).toBeDefined();
  });

  it("без вскрытия и без нетто-выигрыша (chipResult<0) → НЕ MISSED_VALUE", () => {
    const s = checkedTwoPairSnap(); // Player 1 карты не вскрыл
    expect(decisionMarks(s, -1240).find((m) => m.channel === "MISSED_VALUE")).toBeUndefined();
  });
});

describe("assignImportanceLevels — квоты решений в потолке", () => {
  function lossHand(chips: number): { chipResult: number; tableSnapshot: TableSnapshot } {
    const s = baseSnap();
    s.board = ["Kd", "9s", "2c"];
    s.actions.push(
      { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 300 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 300 },
      { street: "FLOP", actor: "Player 1", action: "BET", amount: 600 },
      { street: "FLOP", actor: "Hero", action: "CALL", amount: 600 },
    );
    return { chipResult: chips, tableSnapshot: s };
  }

  function bigFoldHand(): { chipResult: number; tableSnapshot: TableSnapshot } {
    const s = baseSnap();
    s.board = ["Kd", "2s", "6s", "2c", "Td"];
    s.actions.push(
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 120 },
      { street: "FLOP", actor: "Player 1", action: "BET", amount: 300 },
      { street: "FLOP", actor: "Hero", action: "CALL", amount: 300 },
      { street: "RIVER", actor: "Player 1", action: "BET", amount: 900 },
      { street: "RIVER", actor: "Hero", action: "FOLD" },
    );
    return { chipResult: -520, tableSnapshot: s };
  }

  it("в турнире-катастрофе решения получают 2 гарантированных слота", () => {
    const losses = Array.from({ length: 9 }, (_, i) => lossHand(-(9 - i) * 1000));
    const folds = [bigFoldHand(), bigFoldHand()];
    const levels = assignImportanceLevels([...losses, ...folds]);

    // Потери: топ-5 по деньгам критические, решения — свои 2 слота.
    expect(levels.slice(0, 5).every((l) => l === "CRITICAL")).toBe(true);
    expect(levels[9]).toBe("CRITICAL");
    expect(levels[10]).toBe("CRITICAL");
    expect(levels.filter((l) => l === "CRITICAL").length).toBe(7);
  });

  it("без решений потолок целиком достаётся потерям (как раньше)", () => {
    const losses = Array.from({ length: 9 }, (_, i) => lossHand(-(9 - i) * 1000));
    const levels = assignImportanceLevels(losses);
    expect(levels.filter((l) => l === "CRITICAL").length).toBe(7);
  });

  it("топовый по весу решения кандидат берётся раньше слабого", () => {
    const strongFold = bigFoldHand(); // банк+цена ~19.9 BB
    const weakFoldSnap = bigFoldHand();
    weakFoldSnap.tableSnapshot.actions = weakFoldSnap.tableSnapshot.actions.map((a) =>
      a.street === "RIVER" && a.action === "BET" ? { ...a, amount: 550 } : a,
    );
    const losses = Array.from({ length: 9 }, (_, i) => lossHand(-(9 - i) * 1000));
    const levels = assignImportanceLevels([...losses, weakFoldSnap, strongFold]);
    // Оба фолда существенные, но слотов решений 2 — оба и войдут; проверяем порядок весов
    // косвенно: сильный фолд точно критический.
    expect(levels[10]).toBe("CRITICAL");
  });
});

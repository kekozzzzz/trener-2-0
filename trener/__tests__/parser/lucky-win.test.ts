/**
 * Тесты детектора доезда (parser/lucky-win.ts, plans/2026-07-04-критические-по-доезду.md):
 * эквити перебором против вскрытой руки + отбор «выиграл, но был далеко позади».
 * Плюс: доезды добирают остаток потолка критических в assignImportanceLevels.
 */

import { describe, it, expect } from "vitest";
import type { TableSnapshot } from "@/parser/types";
import { equityVsHand, detectHeroLuckyWin } from "@/parser/lucky-win";
import { assignImportanceLevels } from "@/parser/ggpoker/classify";

describe("equityVsHand", () => {
  it("на ривере готовая рука против худшей = 100%", () => {
    // Борд K72 4 9 радуга: AA против QQ — у дам ноль.
    const eq = equityVsHand(["As", "Ad"], ["Qc", "Qd"], ["Kh", "7c", "2s", "4d", "9h"]);
    expect(eq).toBe(100);
  });

  it("вторая пара против топ-пары на флопе — далеко позади (~10%)", () => {
    // Пример Артёма: KJ против Ax на A-K-2 — у KJ пять аутов.
    const eq = equityVsHand(["Kh", "Jd"], ["As", "Qc"], ["Ad", "Kc", "2h"]);
    expect(eq).not.toBeNull();
    expect(eq!).toBeLessThan(33);
    expect(eq!).toBeGreaterThan(5);
  });

  it("флеш-дро на флопе — выше порога доезда (~35-40%)", () => {
    const eq = equityVsHand(["Ah", "Qh"], ["Kc", "Kd"], ["2h", "9h", "7c"]);
    expect(eq).not.toBeNull();
    expect(eq!).toBeGreaterThan(33);
  });

  it("дубль карты (кривой вход) — null", () => {
    expect(equityVsHand(["As", "Ad"], ["As", "Kd"], ["2h", "9h", "7c"])).toBeNull();
  });
});

// Стол BB=100: Hero коллирует крупную ставку на флопе со второй парой против
// вскрытой топ-пары и добирается до выигрыша (доезд).
function luckyWinSnap(overrides?: {
  heroCards?: string[];
  villainShown?: string[];
  heroCallAmount?: number;
}): TableSnapshot {
  return {
    seats: [
      { label: "Player 1", position: "BB", startingStack: 5000, seatNumber: 1, shownCards: overrides?.villainShown ?? ["As", "Qc"] },
      { label: "Player 2", position: "SB", startingStack: 5000, seatNumber: 2 },
      { label: "Hero", position: "BTN", startingStack: 5000, seatNumber: 3 },
    ],
    heroCards: overrides?.heroCards ?? ["Kh", "Jd"],
    board: ["Ad", "Kc", "2h", "7s", "Jh"], // тёрн-ривер дали Hero две пары — доехал
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Player 1", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 120 },
      { street: "FLOP", actor: "Player 1", action: "BET", amount: 600 },
      { street: "FLOP", actor: "Hero", action: "CALL", amount: overrides?.heroCallAmount ?? 600 },
      { street: "TURN", actor: "Player 1", action: "CHECK" },
      { street: "TURN", actor: "Hero", action: "CHECK" },
      { street: "RIVER", actor: "Player 1", action: "CHECK" },
      { street: "RIVER", actor: "Hero", action: "CHECK" },
    ],
    potTotal: 1240,
  };
}

describe("detectHeroLuckyWin", () => {
  it("крупный колл далеко позади вскрытой руки → доезд (улица и эквити)", () => {
    const lucky = detectHeroLuckyWin(luckyWinSnap());
    expect(lucky).not.toBeNull();
    expect(lucky!.street).toBe("FLOP");
    expect(lucky!.equityPct).toBeLessThan(33);
  });

  it("мелкое вложение (блок-бет) — не доезд", () => {
    expect(detectHeroLuckyWin(luckyWinSnap({ heroCallAmount: 200 }))).toBeNull();
  });

  it("соперник не вскрылся — не судим", () => {
    const snap = luckyWinSnap();
    delete snap.seats[0].shownCards;
    expect(detectHeroLuckyWin(snap)).toBeNull();
  });

  it("вложение с живым эквити (флип и лучше) — не доезд", () => {
    // AQ против KK на 2h 9h 7c — флеш-дро + оверкарта, ~40%: выше порога.
    const snap = luckyWinSnap({ heroCards: ["Ah", "Qh"], villainShown: ["Kc", "Kd"] });
    snap.board = ["2h", "9h", "7c", "Ac", "4d"];
    expect(detectHeroLuckyWin(snap)).toBeNull();
  });
});

describe("assignImportanceLevels — доезды в критических", () => {
  it("выигранный доезд становится CRITICAL, обычный выигрыш — STRONG", () => {
    const luckyHand = { chipResult: 1240, tableSnapshot: luckyWinSnap() };
    // Обычный выигрыш без вскрытия — спорная раздача, но не доезд. Рука Hero слабая
    // (воздух), иначе чек-бэк сильной руки на ривере — недобор, и раздачу честно
    // заберёт канал MISSED_VALUE критических по решению (план 2026-07-11).
    const plainSnap = luckyWinSnap({ heroCards: ["5d", "4c"] });
    delete plainSnap.seats[0].shownCards;
    const plainWin = { chipResult: 500, tableSnapshot: plainSnap };

    const levels = assignImportanceLevels([luckyHand, plainWin]);
    expect(levels[0]).toBe("CRITICAL");
    expect(levels[1]).toBe("STRONG");
  });

  it("потери приоритетнее доездов при заполненном потолке", () => {
    const loss = (n: number) => ({ chipResult: -1000 - n, tableSnapshot: lossSnap() });
    const losses = Array.from({ length: 7 }, (_, i) => loss(i));
    const luckyHand = { chipResult: 1240, tableSnapshot: luckyWinSnap() };

    const levels = assignImportanceLevels([...losses, luckyHand]);
    expect(levels.slice(0, 7).every((l) => l === "CRITICAL")).toBe(true);
    expect(levels[7]).toBe("STRONG"); // потолок занят потерями — доезд остался сильной
  });
});

// Спорная проигранная раздача: Hero коллирует ставку соперника.
function lossSnap(): TableSnapshot {
  return {
    seats: [
      { label: "Player 1", position: "BB", startingStack: 5000, seatNumber: 1 },
      { label: "Hero", position: "BTN", startingStack: 5000, seatNumber: 3 },
    ],
    heroCards: ["Kh", "Jd"],
    board: ["Ad", "Kc", "2h"],
    actions: [
      { street: "PREFLOP", actor: "Player 1", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 700 },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 480 },
      { street: "FLOP", actor: "Player 1", action: "BET", amount: 900 },
      { street: "FLOP", actor: "Hero", action: "FOLD" },
    ],
    potTotal: 1400,
  };
}

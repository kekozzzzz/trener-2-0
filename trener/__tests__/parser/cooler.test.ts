/**
 * Тесты детектора кулера (parser/cooler.ts, plans/2026-07-05-кулеры-и-перезаходы.md):
 * зеркало доезда — Hero крупно вложился далеко ВПЕРЕДИ вскрытой руки и проиграл.
 * Плюс: кулеры уходят в COOLER и не тратят слоты критических (assignImportanceLevels).
 */

import { describe, it, expect } from "vitest";
import type { TableSnapshot } from "@/parser/types";
import { detectHeroCooler, hasCleanPreflop, equityVsRangePreflop } from "@/parser/cooler";
import { assignImportanceLevels } from "@/parser/ggpoker/classify";

// Стол BB=100: Hero (KK, оверпара) чек-коллит крупный олл-ин на тёрне против
// вскрытого стрит-дро/пары и проигрывает на ривере — классический кулер.
// Борд: Q72 радуга, тёрн 3, ривер даёт сопернику доезд.
function coolerSnap(overrides?: {
  heroCards?: string[];
  villainShown?: string[];
  heroCallAmount?: number;
  heroPreflopRaise?: number;
}): TableSnapshot {
  return {
    seats: [
      { label: "Player 1", position: "BB", startingStack: 5000, seatNumber: 1, shownCards: overrides?.villainShown ?? ["Qh", "Jh"] },
      { label: "Player 2", position: "SB", startingStack: 5000, seatNumber: 2 },
      { label: "Hero", position: "BTN", startingStack: 5000, seatNumber: 3 },
    ],
    heroCards: overrides?.heroCards ?? ["Ks", "Kd"],
    board: ["Qc", "7d", "2h", "3s", "Jc"], // ривер спарил валета — соперник с QJ доехал до двух пар
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Player 1", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: overrides?.heroPreflopRaise ?? 220 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 120 },
      { street: "FLOP", actor: "Player 1", action: "CHECK" },
      { street: "FLOP", actor: "Hero", action: "BET", amount: 300 },
      { street: "FLOP", actor: "Player 1", action: "CALL", amount: 300 },
      { street: "TURN", actor: "Player 1", action: "ALL_IN", amount: 4480 },
      { street: "TURN", actor: "Hero", action: "CALL", amount: overrides?.heroCallAmount ?? 4480 },
    ],
    potTotal: 10000,
  };
}

describe("detectHeroCooler", () => {
  it("крупный колл далеко впереди вскрытой руки → кулер (улица и эквити)", () => {
    const cooler = detectHeroCooler(coolerSnap());
    expect(cooler).not.toBeNull();
    expect(cooler!.street).toBe("TURN");
    expect(cooler!.equityPct).toBeGreaterThanOrEqual(67);
  });

  it("Hero позади вскрытой руки — не кулер", () => {
    // JJ против AQ на борде с дамой: топ-пара впереди — Hero сам ехал, это не кулер.
    const behind = coolerSnap({ heroCards: ["Jd", "Jh"], villainShown: ["Ac", "Qs"] });
    expect(detectHeroCooler(behind)).toBeNull();
  });

  it("мелкое вложение — не кулер", () => {
    expect(detectHeroCooler(coolerSnap({ heroCallAmount: 200 }))).toBeNull();
  });

  it("без вскрытых карт соперника — не кулер (нечем доказать)", () => {
    const snap = coolerSnap();
    snap.seats[0].shownCards = undefined;
    expect(detectHeroCooler(snap)).toBeNull();
  });
});

describe("detectHeroCooler — префлоп-олл-ин (Монте-Карло с фиксированным зерном)", () => {
  it("AA против KK на префлопе — архетипный кулер (~81%)", () => {
    const s = coolerSnap({ heroCards: ["As", "Ad"], villainShown: ["Kc", "Kd"] });
    // весь стек заходит уже на префлопе
    s.actions = [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Player 1", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "ALL_IN", amount: 5000 },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 4780 },
    ];
    const cooler = detectHeroCooler(s);
    expect(cooler).not.toBeNull();
    expect(cooler!.street).toBe("PREFLOP");
    expect(cooler!.equityPct).toBeGreaterThan(78);
    expect(cooler!.equityPct).toBeLessThan(85);
  });

  it("детерминированность: два вызова дают одно и то же число", () => {
    const s = coolerSnap({ heroCards: ["As", "Ad"], villainShown: ["Kc", "Kd"] });
    s.actions = [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Player 1", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 5000 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 4900 },
    ];
    expect(detectHeroCooler(s)!.equityPct).toBe(detectHeroCooler(s)!.equityPct);
  });

  it("флип (AKo против QQ) — не кулер", () => {
    const s = coolerSnap({ heroCards: ["As", "Kd"], villainShown: ["Qc", "Qd"] });
    s.actions = [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Player 1", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 5000 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 4900 },
    ];
    expect(detectHeroCooler(s)).toBeNull();
  });
});

// Эквити Hero против ДИАПАЗОНА на префлоп-олл-ине (план
// 2026-07-26-эталонный-3бет-диапазон.md) — эталонный запасной факт, когда игрок сам
// диапазон не отметил. Проверено внешним источником (cardfight.com) 26.07: KQo vs AA
// ≈12.88% — здесь то же самое, но против МНОЖЕСТВА комбо сразу.
describe("equityVsRangePreflop — эквити против диапазона на префлоп-олл-ине", () => {
  it("KQo против чистого AA (диапазон из одного кода, 6 комбо) — близко к KQo vs AA (~12.9%)", () => {
    const eq = equityVsRangePreflop(["Kc", "Qd"], ["AA"]);
    expect(eq).not.toBeNull();
    expect(eq!.equityPct).toBeGreaterThan(10);
    expect(eq!.equityPct).toBeLessThan(16);
    expect(eq!.combosLive).toBe(6);
  });

  it("KQo против мусора (72o) — Hero фаворит с большим отрывом", () => {
    const eq = equityVsRangePreflop(["Kc", "Qd"], ["72o"])!;
    expect(eq.equityPct).toBeGreaterThan(60);
    expect(eq.combosLive).toBe(12);
  });

  it("вес комбо: смешанный диапазон {AA,72o} (6 и 12 комбо) ближе к 72o, чем к AA", () => {
    const eqAA = equityVsRangePreflop(["Kc", "Qd"], ["AA"])!.equityPct;
    const eqTrash = equityVsRangePreflop(["Kc", "Qd"], ["72o"])!.equityPct;
    const mix = equityVsRangePreflop(["Kc", "Qd"], ["AA", "72o"])!;
    expect(mix.combosLive).toBe(18);
    expect(mix.equityPct).toBeGreaterThan(eqAA);
    expect(mix.equityPct).toBeLessThan(eqTrash);
    // 12 комбо 72o против 6 комбо AA — смесь ближе к 72o, чем к середине.
    const mid = (eqAA + eqTrash) / 2;
    expect(mix.equityPct).toBeGreaterThan(mid);
  });

  it("против реального эталонного диапазона 3-бета CO — заметно честнее, чем «против одной AA»", () => {
    // Тот самый диапазон CO из vs-open-chart.ts (велью+блеф) — не 12%, а близко к полтине,
    // потому что KQo сам входит в диапазон блефа и бьёт немалую часть чужих рук.
    const range = [
      "JJ", "AKs", "AKo", "AQs", "AQo", // велью
      "TT", "AJs", "ATs", "A5s", "A4s", "A3s", "KQs", "KJs", "KTs", "KQo", "KJo", "AJo", "ATo", "KTo", "76s", "65s", // блеф
    ];
    const eq = equityVsRangePreflop(["Kc", "Qd"], range)!;
    expect(eq.equityPct).toBeGreaterThan(35);
    expect(eq.equityPct).toBeLessThan(55);
  });

  it("детерминированность: два вызова с одним входом дают одно и то же число", () => {
    const call = () => equityVsRangePreflop(["Ac", "Kd"], ["QQ", "JJ", "AKo"]);
    expect(call()).toEqual(call());
  });

  it("пустой диапазон → null", () => {
    expect(equityVsRangePreflop(["Kc", "Qd"], [])).toBeNull();
  });

  it("Hero держит обе карты редкой пары (AA vs AA) — не падает, честная развязка ~50%", () => {
    // Крайний случай: у диапазона AA после вычета карт Hero остаётся только одно живое
    // комбо (AcAs) — не пусто, движок должен честно посчитать, а не споткнуться.
    const eq = equityVsRangePreflop(["Ah", "Ad"], ["AA"]);
    expect(eq).not.toBeNull();
    expect(eq!.combosLive).toBe(1);
    expect(eq!.equityPct).toBeGreaterThan(35);
    expect(eq!.equityPct).toBeLessThan(65);
  });
});

describe("hasCleanPreflop", () => {
  it("стандартное открытие — чистый префлоп", () => {
    expect(hasCleanPreflop(coolerSnap())).toBe(true);
  });
});

describe("assignImportanceLevels — кулеры", () => {
  it("кулер-потеря уходит в COOLER и не тратит слот критических", () => {
    const cooler = { chipResult: -5000, tableSnapshot: coolerSnap() };
    // Обычная спорная потеря (без вскрытия) — кандидат в критические.
    const plainLossSnap = coolerSnap();
    plainLossSnap.seats[0].shownCards = undefined;
    const plainLoss = { chipResult: -3000, tableSnapshot: plainLossSnap };

    const levels = assignImportanceLevels([cooler, plainLoss]);
    expect(levels[0]).toBe("COOLER");
    expect(levels[1]).toBe("CRITICAL");
  });
});

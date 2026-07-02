/**
 * Тесты лик-трекера (features/profile/leak-trend.ts, plans/2026-07-02-лик-трекер.md).
 *
 * Покрывают: счётчики ликов по раздачам через реальные детекторы (широкое открытие,
 * лимп, чистая раздача), ключ игрового дня (UTC) и динамику по окну дней (порог
 * активности LEAK_ACTIVE_MIN_DAYS, сортировка по частоте, отметка improved
 * «в этот день ни разу»).
 */

import { describe, it, expect } from "vitest";
import type { Position, TableAction, TableSnapshot } from "@/parser/types";
import {
  countLeaks,
  gameDayKey,
  leakDynamics,
  LEAK_KINDS,
  type LeakCounts,
} from "@/features/profile/leak-trend";

// Стол на 40bb (BB=100): SB и BB постят, дальше префлоп-действия. Hero — на заданной позиции.
function snap(opts: {
  heroCards: string[];
  heroPosition?: Position;
  preflop: TableAction[];
}): { tableData: TableSnapshot } {
  return {
    tableData: {
      seats: [
        { label: "Player 1", position: "SB", startingStack: 4000 },
        { label: "Player 2", position: "BB", startingStack: 4000 },
        { label: "Hero", position: opts.heroPosition ?? "CO", startingStack: 4000 },
      ],
      heroCards: opts.heroCards,
      board: [],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 },
        ...opts.preflop,
      ],
      potTotal: 0,
    },
  };
}

// Открытие мусором с ранней позиции — заведомо шире RFI-чарта.
const wideOpen = snap({
  heroCards: ["Qc", "2d"],
  heroPosition: "EARLY",
  preflop: [{ street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 }],
});

// Опен-лимп: Hero первым просто коллирует блайнд.
const openLimp = snap({
  heroCards: ["8c", "6d"],
  preflop: [{ street: "PREFLOP", actor: "Hero", action: "CALL", amount: 100 }],
});

// Чистая раздача: Hero сбросил — ликов нет.
const cleanFold = snap({
  heroCards: ["9c", "3d"],
  preflop: [{ street: "PREFLOP", actor: "Hero", action: "FOLD" }],
});

// Счётчики с нулями по всем видам, кроме переданных.
function mk(partial: Partial<LeakCounts>): LeakCounts {
  const base = Object.fromEntries(LEAK_KINDS.map((k) => [k, 0])) as LeakCounts;
  return { ...base, ...partial };
}

describe("countLeaks", () => {
  it("широкое открытие и лимп посчитаны, чистая раздача — нет", () => {
    const counts = countLeaks([wideOpen, openLimp, cleanFold]);
    expect(counts.OPEN_WIDE).toBe(1);
    expect(counts.LIMP).toBe(1);
    expect(counts.BB_3BET_WIDE).toBe(0);
    expect(counts.OPEN_SHOVE_WIDE).toBe(0);
    expect(counts.VS_OPEN_3BET_WIDE).toBe(0);
    expect(counts.ISO_WIDE).toBe(0);
    expect(counts.SQUEEZE_WIDE).toBe(0);
    expect(counts.FOURBET_WIDE).toBe(0);
  });

  it("повторы суммируются", () => {
    const counts = countLeaks([wideOpen, wideOpen, openLimp]);
    expect(counts.OPEN_WIDE).toBe(2);
    expect(counts.LIMP).toBe(1);
  });

  it("пустой набор раздач → нули", () => {
    const counts = countLeaks([]);
    for (const kind of LEAK_KINDS) expect(counts[kind]).toBe(0);
  });
});

describe("gameDayKey", () => {
  it("турниры одного вечера склеиваются в один игровой день (UTC)", () => {
    expect(gameDayKey(new Date("2026-07-02T18:05:00Z"))).toBe("2026-07-02");
    expect(gameDayKey(new Date("2026-07-02T23:40:00Z"))).toBe("2026-07-02");
    expect(gameDayKey(new Date("2026-07-03T00:15:00Z"))).toBe("2026-07-03");
  });
});

describe("leakDynamics", () => {
  it("лик в 2+ прошлых игровых днях активен; в текущем дне 0 → improved", () => {
    const prior = [mk({ LIMP: 4 }), mk({ LIMP: 2 }), mk({})];
    const trends = leakDynamics(prior, mk({}));
    expect(trends).toHaveLength(1);
    expect(trends[0]).toEqual({
      kind: "LIMP",
      window: [4, 2, 0],
      current: 0,
      priorTotal: 6,
      improved: true,
    });
  });

  it("лик в одном прошлом дне — случайность, не активен", () => {
    const trends = leakDynamics([mk({ OPEN_WIDE: 3 }), mk({}), mk({})], mk({ OPEN_WIDE: 1 }));
    expect(trends).toHaveLength(0);
  });

  it("повтор в текущем дне → improved false, current честный", () => {
    const prior = [mk({ OPEN_WIDE: 2 }), mk({ OPEN_WIDE: 1 })];
    const trends = leakDynamics(prior, mk({ OPEN_WIDE: 3 }));
    expect(trends).toHaveLength(1);
    expect(trends[0].current).toBe(3);
    expect(trends[0].improved).toBe(false);
  });

  it("сортировка: самый частый лик за окно — первым", () => {
    const prior = [mk({ LIMP: 1, OPEN_WIDE: 5 }), mk({ LIMP: 1, OPEN_WIDE: 4 })];
    const trends = leakDynamics(prior, mk({}));
    expect(trends.map((t) => t.kind)).toEqual(["OPEN_WIDE", "LIMP"]);
  });

  it("пустое окно (первые игровые дни игрока) → трекать нечего", () => {
    expect(leakDynamics([], mk({ LIMP: 5 }))).toHaveLength(0);
  });
});

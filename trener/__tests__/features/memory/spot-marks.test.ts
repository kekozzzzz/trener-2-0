/**
 * Тесты меток ошибок раздачи (features/memory/spot-marks.ts,
 * plans/2026-07-05-память-тренера-2.md): переиспользование детекторов лик-трекера
 * и доезда, устойчивость к кривому снимку, человеческие подписи.
 */

import { describe, it, expect } from "vitest";
import type { TableSnapshot } from "@/parser/types";
import { computeSpotMarks, mistakeLabel } from "@/features/memory/spot-marks";

// Hero на BTN лимпит (колл 100 без рейза до него) — детектор LIMP должен сработать.
function limpSnap(): TableSnapshot {
  return {
    seats: [
      { label: "Player 1", position: "BB", startingStack: 5000, seatNumber: 1 },
      { label: "Player 2", position: "SB", startingStack: 5000, seatNumber: 2 },
      { label: "Hero", position: "BTN", startingStack: 5000, seatNumber: 3 },
    ],
    heroCards: ["7h", "6h"],
    board: [],
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Player 1", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 100 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CHECK" },
    ],
    potTotal: 250,
  };
}

// Доезд: Hero крупно коллирует на флопе со второй парой против вскрытой топ-пары
// и добирается (копия фикстуры lucky-win.test.ts).
function luckyWinSnap(): TableSnapshot {
  return {
    seats: [
      { label: "Player 1", position: "BB", startingStack: 5000, seatNumber: 1, shownCards: ["As", "Qc"] },
      { label: "Player 2", position: "SB", startingStack: 5000, seatNumber: 2 },
      { label: "Hero", position: "BTN", startingStack: 5000, seatNumber: 3 },
    ],
    heroCards: ["Kh", "Jd"],
    board: ["Ad", "Kc", "2h", "7s", "Jh"],
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Player 1", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 120 },
      { street: "FLOP", actor: "Player 1", action: "BET", amount: 600 },
      { street: "FLOP", actor: "Hero", action: "CALL", amount: 600 },
      { street: "TURN", actor: "Player 1", action: "CHECK" },
      { street: "TURN", actor: "Hero", action: "CHECK" },
      { street: "RIVER", actor: "Player 1", action: "CHECK" },
      { street: "RIVER", actor: "Hero", action: "CHECK" },
    ],
    potTotal: 1240,
  };
}

describe("computeSpotMarks", () => {
  it("лимп даёт метку LIMP", () => {
    const marks = computeSpotMarks(limpSnap());
    expect(marks.map((m) => m.kind)).toContain("LIMP");
  });

  it("доезд даёт метку LUCKY_WIN с улицей и эквити", () => {
    const marks = computeSpotMarks(luckyWinSnap());
    const lucky = marks.find((m) => m.kind === "LUCKY_WIN");
    expect(lucky).toBeDefined();
    expect(lucky!.street).toBe("FLOP");
    expect(lucky!.equityPct).toBeLessThan(33);
  });

  it("чистая раздача (нормальное открытие, без вскрытия) — без меток", () => {
    const snap = luckyWinSnap();
    delete snap.seats[0].shownCards; // соперник не вскрылся — доезд не судим
    expect(computeSpotMarks(snap)).toEqual([]);
  });

  it("кривой снимок не роняет парс-шаг — пустые метки", () => {
    expect(computeSpotMarks({} as TableSnapshot)).toEqual([]);
  });
});

describe("mistakeLabel", () => {
  it("доезд — с улицей и эквити", () => {
    expect(mistakeLabel({ kind: "LUCKY_WIN", street: "TURN", equityPct: 18 })).toBe(
      "крупное вложение на тёрне с эквити 18%, будучи далеко позади",
    );
  });

  it("префлопные лики — короткие подписи", () => {
    expect(mistakeLabel({ kind: "LIMP" })).toBe("лимп");
    expect(mistakeLabel({ kind: "OPEN_WIDE" })).toBe("открытие первым шире нормы");
  });
});

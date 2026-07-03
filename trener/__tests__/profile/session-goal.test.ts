/**
 * Тесты задания на сессию (features/profile/session-goal.ts,
 * plans/2026-07-03-задание-на-сессию.md).
 *
 * Покрывают: выбор задания (топ активного лика окна, порог активности из лик-трекера),
 * отсутствие задания при чистой игре / короткой истории, детерминированную проверку
 * итога сессии (done / violations) и стабильность «задание до = проверка после».
 */

import { describe, it, expect } from "vitest";
import { LEAK_KINDS, type LeakCounts } from "@/features/profile/leak-trend";
import { sessionGoal, goalResult } from "@/features/profile/session-goal";

// Счётчики с нулями по всем видам, кроме переданных.
function mk(partial: Partial<LeakCounts>): LeakCounts {
  const base = Object.fromEntries(LEAK_KINDS.map((k) => [k, 0])) as LeakCounts;
  return { ...base, ...partial };
}

describe("sessionGoal", () => {
  it("задание — самый частый активный лик окна", () => {
    const prior = [mk({ LIMP: 1, OPEN_WIDE: 5 }), mk({ LIMP: 2, OPEN_WIDE: 4 })];
    expect(sessionGoal(prior)).toBe("OPEN_WIDE");
  });

  it("лик в одном дне — случайность, задания не даёт", () => {
    expect(sessionGoal([mk({ SQUEEZE_WIDE: 4 }), mk({}), mk({})])).toBeNull();
  });

  it("чистая игра → задания нет", () => {
    expect(sessionGoal([mk({}), mk({}), mk({})])).toBeNull();
  });

  it("пустое окно (новый игрок) → задания нет", () => {
    expect(sessionGoal([])).toBeNull();
  });

  it("задание детерминировано: одно и то же окно → одно и то же задание", () => {
    const prior = [mk({ BB_3BET_WIDE: 2, LIMP: 2 }), mk({ BB_3BET_WIDE: 1, LIMP: 3 })];
    expect(sessionGoal(prior)).toBe(sessionGoal(prior));
  });
});

describe("goalResult", () => {
  it("лик в сессии не встретился → выполнено", () => {
    const r = goalResult("LIMP", mk({ OPEN_WIDE: 2 }));
    expect(r).toEqual({ kind: "LIMP", done: true, violations: 0 });
  });

  it("лик повторился → не выполнено, честный счётчик нарушений", () => {
    const r = goalResult("LIMP", mk({ LIMP: 3 }));
    expect(r.done).toBe(false);
    expect(r.violations).toBe(3);
  });
});

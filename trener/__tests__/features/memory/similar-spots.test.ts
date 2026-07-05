/**
 * Тесты чистого отбора памяти тренера (features/memory/similar-spots.ts,
 * plans/2026-07-05-память-тренера-2.md): два канала — тот же спот (отпечаток ≥5/6)
 * и та же ошибка (совпала метка детектора), ранжирование, потолок, обрезка вердикта.
 */

import { describe, it, expect } from "vitest";
import type { StoredSpot } from "@/features/memory/spot-marks";
import { selectSpotPicks, verdictSnippet, type LightCandidate } from "@/features/memory/similar-spots";

function fp(over: Partial<StoredSpot> = {}): StoredSpot {
  return {
    position: "BB",
    stack: "MID",
    role: "BBDEF",
    street: "FLOP",
    board: { suitedness: "MONOTONE", paired: false, connected: "CONNECTED" },
    connection: "WHIFF",
    ...over,
  };
}

let nextId = 0;
function cand(spot: StoredSpot): LightCandidate {
  return { id: `hand-${nextId++}`, spot };
}

describe("selectSpotPicks — канал «тот же спот»", () => {
  const current = fp();

  it("идентичный спот → EXACT, отличие в одном признаке → SIMILAR", () => {
    const exact = cand(fp()); // счёт 6
    const similar = cand(fp({ connection: "DRAW" })); // счёт 5
    const result = selectSpotPicks(current, [similar, exact]);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: exact.id, matchLevel: "EXACT" });
    expect(result[1]).toMatchObject({ id: similar.id, matchLevel: "SIMILAR" });
  });

  it("слишком непохожий (≤4 совпадений) без общей ошибки → отсеивается", () => {
    const weak = cand(fp({ connection: "DRAW", position: "BTN" })); // счёт 4
    expect(selectSpotPicks(current, [weak])).toHaveLength(0);
  });

  it("не больше трёх прошлых раздач в выдаче", () => {
    const many = [cand(fp()), cand(fp()), cand(fp()), cand(fp()), cand(fp())];
    expect(selectSpotPicks(current, many)).toHaveLength(3);
  });

  it("при равном счёте свежая раздача (раньше в списке) выше", () => {
    const fresh = cand(fp());
    const old = cand(fp());
    const result = selectSpotPicks(current, [fresh, old]);
    expect(result.map((p) => p.id)).toEqual([fresh.id, old.id]);
  });
});

describe("selectSpotPicks — канал «та же ошибка»", () => {
  const current = fp({ marks: [{ kind: "LIMP" }] });

  it("совпавшая метка проходит даже при непохожем споте → SAME_MISTAKE", () => {
    // Совсем другой спот (счёт 0-1), но тоже лимп.
    const other = cand(
      fp({
        position: "HJ",
        stack: "DEEP",
        role: "LIMP",
        street: "PREFLOP",
        board: null,
        connection: "NONE",
        marks: [{ kind: "LIMP" }],
      }),
    );
    const [pick] = selectSpotPicks(current, [other]);
    expect(pick).toMatchObject({ matchLevel: "SAME_MISTAKE", mistake: { kind: "LIMP" } });
  });

  it("чужая метка без похожести спота — не повод", () => {
    const other = cand(
      fp({ position: "HJ", stack: "DEEP", role: "OPEN", marks: [{ kind: "OPEN_WIDE" }] }),
    );
    expect(selectSpotPicks(current, [other])).toHaveLength(0);
  });

  it("один-в-один И та же ошибка → EXACT с меткой, выше простого один-в-один", () => {
    const plainExact = cand(fp());
    const exactSameMistake = cand(fp({ marks: [{ kind: "LIMP" }] }));
    const result = selectSpotPicks(current, [plainExact, exactSameMistake]);

    expect(result[0]).toMatchObject({
      id: exactSameMistake.id,
      matchLevel: "EXACT",
      mistake: { kind: "LIMP" },
    });
    expect(result[1]).toMatchObject({ id: plainExact.id, matchLevel: "EXACT", mistake: null });
  });

  it("доезд сравнивается по виду ошибки, улица не важна", () => {
    const currentLucky = fp({ marks: [{ kind: "LUCKY_WIN", street: "RIVER", equityPct: 12 }] });
    const prior = cand(
      fp({
        position: "CO",
        role: "OPEN",
        marks: [{ kind: "LUCKY_WIN", street: "FLOP", equityPct: 20 }],
      }),
    );
    const [pick] = selectSpotPicks(currentLucky, [prior]);
    expect(pick).toMatchObject({ matchLevel: "SAME_MISTAKE", mistake: { kind: "LUCKY_WIN" } });
  });

  it("у текущей раздачи нет меток → канал ошибок молчит, работает только отпечаток", () => {
    const noMarks = fp();
    const prior = cand(fp({ position: "HJ", stack: "DEEP", marks: [{ kind: "LIMP" }] }));
    expect(selectSpotPicks(noMarks, [prior])).toHaveLength(0);
  });
});

describe("verdictSnippet — напоминание прошлого вердикта", () => {
  it("короткий вердикт проходит целиком, пустой → null", () => {
    expect(verdictSnippet("Колл был минусовый.")).toBe("Колл был минусовый.");
    expect(verdictSnippet(null)).toBeNull();
    expect(verdictSnippet("   ")).toBeNull();
  });

  it("длинный режется по границе слова с многоточием", () => {
    const long = `${"слово ".repeat(80)}хвост`;
    const cut = verdictSnippet(long)!;
    expect(cut.length).toBeLessThanOrEqual(301);
    expect(cut.endsWith("…")).toBe(true);
    expect(cut).not.toContain("хвост");
  });
});

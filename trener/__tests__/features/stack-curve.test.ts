/**
 * Кривая стека по ходу турнира (features/tournaments/stack-curve.ts).
 *
 * Линия под разбором раздачи: стек героя по каждой раздаче плюс отметка разбираемой.
 *
 * Линия строится В ФИШКАХ (решение Артёма 2026-08-09): блайнды растут быстрее стека,
 * поэтому в больших блайндах даже удачный турнир выглядит как непрерывное падение.
 * Глубина в BB считается тут же и показывается рядом — но форму линии задают фишки.
 */

import { describe, it, expect } from "vitest";
import { buildStackCurve, type StackCurveRow } from "@/features/tournaments/stack-curve";

const row = (
  handId: string,
  stack: number | null,
  bigBlind: number | null,
  extra: Partial<StackCurveRow> = {}
): StackCurveRow => ({
  handId,
  stack,
  bigBlind,
  chipResult: null,
  hasReview: false,
  heroCards: null,
  ...extra,
});

describe("buildStackCurve", () => {
  it("ведёт линию по фишкам, а глубину считает отдельно", () => {
    // Фишек стало больше (10 000 → 12 000), но блайнды выросли вчетверо: линия идёт
    // вверх (так и было по фишкам), а глубина в BB при этом падает — обе правды рядом.
    const curve = buildStackCurve(
      [
        row("h1", 10000, 100),
        row("h2", 11000, 100),
        row("h3", 12000, 200),
        row("h4", 12000, 400),
      ],
      "h3"
    );

    expect(curve?.points.map((p) => p.stackChips)).toEqual([10000, 11000, 12000, 12000]);
    expect(curve?.points.map((p) => p.stackBb)).toEqual([100, 110, 60, 30]);
  });

  it("находит позицию разбираемой раздачи", () => {
    const curve = buildStackCurve(
      [row("h1", 5000, 100), row("h2", 4000, 100), row("h3", 3000, 100), row("h4", 2000, 100)],
      "h3"
    );

    expect(curve?.currentIndex).toBe(2);
  });

  it("отдаёт currentIndex = null, если раздачи нет в линии", () => {
    const curve = buildStackCurve(
      [row("h1", 5000, 100), row("h2", 4000, 100), row("h3", 3000, 100), row("h4", 2000, 100)],
      "чужая-раздача"
    );

    expect(curve?.currentIndex).toBeNull();
  });

  it("держит в линии раздачи без большого блайнда — фишки сравнимы всегда", () => {
    const curve = buildStackCurve(
      [
        row("h1", 5000, 100),
        row("h2", 4800, null), // в снимке нет POST_BB
        row("h3", 4000, 100),
        row("h4", 3000, 100),
      ],
      "h3"
    );

    expect(curve?.points.map((p) => p.handId)).toEqual(["h1", "h2", "h3", "h4"]);
    // Глубину для такой раздачи не выдумываем — просто не показываем
    expect(curve?.points[1].stackBb).toBeNull();
    expect(curve?.points[1].stackChips).toBe(4800);
  });

  it("пропускает раздачи без стека героя — рисовать нечего", () => {
    const curve = buildStackCurve(
      [
        row("h1", 5000, 100),
        row("h2", null, 100),
        row("h3", 4000, 100),
        row("h4", 3000, 100),
        row("h5", 2000, 100),
      ],
      "h1"
    );

    expect(curve?.points).toHaveLength(4);
  });

  it("считает итог раздачи в фишках и в BB, тащит карты и флаг разбора", () => {
    const curve = buildStackCurve(
      [
        row("h1", 5000, 100),
        row("h2", 4000, 100, { chipResult: -1800, hasReview: true, heroCards: "5s 5h" }),
        row("h3", 3000, 100),
        row("h4", 2000, 100),
      ],
      "h2"
    );

    expect(curve?.points[1]).toMatchObject({
      stackChips: 4000,
      stackBb: 40,
      deltaChips: -1800,
      deltaBb: -18,
      hasReview: true,
      cards: ["5s", "5h"],
    });
  });

  it("нумерует раздачи по исходному порядку, а не по оставшимся точкам", () => {
    // Вторая раздача выпадает (нет стека) — у следующих номера не должны съезжать.
    const curve = buildStackCurve(
      [
        row("h1", 5000, 100),
        row("h2", null, 100),
        row("h3", 4000, 100),
        row("h4", 3000, 100),
        row("h5", 2000, 100),
      ],
      "h3"
    );

    expect(curve?.points.map((p) => p.number)).toEqual([1, 3, 4, 5]);
  });

  it("молчит, когда точек меньше четырёх — отрезок ничего не рассказывает", () => {
    expect(buildStackCurve([row("h1", 5000, 100), row("h2", 4000, 100)], "h1")).toBeNull();
    expect(
      buildStackCurve([row("h1", 5000, 100), row("h2", 4000, 100), row("h3", 3000, 100)], "h1")
    ).toBeNull();
  });

  it("молчит на пустом турнире", () => {
    expect(buildStackCurve([], "h1")).toBeNull();
  });

  it("не делит на ноль, если большой блайнд нулевой", () => {
    const curve = buildStackCurve(
      [
        row("h1", 5000, 0, { chipResult: -500 }),
        row("h2", 4000, 100),
        row("h3", 3000, 100),
        row("h4", 2000, 100),
      ],
      "h2"
    );

    expect(curve?.points[0].stackBb).toBeNull();
    expect(curve?.points[0].deltaBb).toBeNull();
    expect(curve?.points[0].stackChips).toBe(5000);
  });
});

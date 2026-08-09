/**
 * Кривая стека по ходу турнира (features/tournaments/stack-curve.ts).
 *
 * Линия под разбором раздачи: стек героя в больших блайндах на начало каждой раздачи
 * плюс отметка разбираемой. Проверяем главное: перевод в BB (а не в фишки), выброс
 * несравнимых точек, порог минимальной длины и позицию текущей раздачи.
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
  it("считает стек в больших блайндах, а не в фишках", () => {
    // Фишек стало больше (10 000 → 12 000), но блайнды выросли вдвое — в BB стек упал.
    const curve = buildStackCurve(
      [
        row("h1", 10000, 100),
        row("h2", 11000, 100),
        row("h3", 12000, 200),
        row("h4", 12000, 400),
      ],
      "h3"
    );

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

  it("пропускает раздачи без большого блайнда — их стек несравним", () => {
    const curve = buildStackCurve(
      [
        row("h1", 5000, 100),
        row("h2", 4800, null), // в снимке нет POST_BB
        row("h3", 4000, 100),
        row("h4", 3000, 100),
        row("h5", 2000, 100),
      ],
      "h3"
    );

    expect(curve?.points.map((p) => p.handId)).toEqual(["h1", "h3", "h4", "h5"]);
    // Индекс считается по оставшимся точкам, а не по исходным строкам
    expect(curve?.currentIndex).toBe(1);
  });

  it("пропускает раздачи без стека героя", () => {
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

  it("молчит, когда точек меньше четырёх — отрезок ничего не рассказывает", () => {
    expect(buildStackCurve([row("h1", 5000, 100), row("h2", 4000, 100)], "h1")).toBeNull();
    expect(
      buildStackCurve([row("h1", 5000, 100), row("h2", 4000, 100), row("h3", 3000, 100)], "h1")
    ).toBeNull();
  });

  it("молчит на пустом турнире", () => {
    expect(buildStackCurve([], "h1")).toBeNull();
  });

  it("считает изменение за раздачу в BB и тащит карты с флагом разбора", () => {
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
      stackBb: 40,
      deltaBb: -18,
      hasReview: true,
      cards: ["5s", "5h"],
    });
  });

  it("нумерует раздачи по исходному порядку, а не по оставшимся точкам", () => {
    // Вторая раздача выпадает (нет BB) — у следующих номера не должны съезжать.
    const curve = buildStackCurve(
      [
        row("h1", 5000, 100),
        row("h2", 4800, null),
        row("h3", 4000, 100),
        row("h4", 3000, 100),
        row("h5", 2000, 100),
      ],
      "h3"
    );

    expect(curve?.points.map((p) => p.number)).toEqual([1, 3, 4, 5]);
  });

  it("не делит на ноль, если большой блайнд нулевой", () => {
    const curve = buildStackCurve(
      [
        row("h1", 5000, 0),
        row("h2", 4000, 100),
        row("h3", 3000, 100),
        row("h4", 2000, 100),
        row("h5", 1000, 100),
      ],
      "h2"
    );

    expect(curve?.points.every((p) => Number.isFinite(p.stackBb))).toBe(true);
    expect(curve?.points).toHaveLength(4);
  });
});

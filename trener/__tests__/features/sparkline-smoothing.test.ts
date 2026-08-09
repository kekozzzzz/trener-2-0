/**
 * Сглаживание и прореживание линии стека (components/site/sparkline.tsx).
 *
 * Правка Артёма 2026-08-09: «график какой-то слишком резкий, сделай плавнее».
 * Плавность не должна стоить правды: проверяем, что кривая не выходит за пределы
 * реальных значений, а прореживание сохраняет провалы, концы и отмеченную раздачу.
 */

import { describe, it, expect } from "vitest";
import { thinPoints, smoothPath, smoothValues, smoothingWindow } from "@/lib/sparkline";

describe("thinPoints", () => {
  it("не трогает короткие ряды", () => {
    const values = [10, 20, 30, 40];
    expect(thinPoints(values, 2)).toEqual({ values, markAt: 2 });
  });

  it("режет длинный ряд до обозримого числа точек", () => {
    const values = Array.from({ length: 225 }, (_, i) => 100 - i * 0.3);
    const result = thinPoints(values);
    expect(result.values.length).toBeLessThanOrEqual(65);
    expect(result.values.length).toBeGreaterThan(30);
  });

  it("сохраняет первую и последнюю точку", () => {
    const values = Array.from({ length: 300 }, (_, i) => 50 + Math.sin(i) * 10);
    const result = thinPoints(values);
    expect(result.values[0]).toBe(values[0]);
    expect(result.values[result.values.length - 1]).toBe(values[values.length - 1]);
  });

  it("держит маркер на его настоящем значении", () => {
    const values = Array.from({ length: 300 }, (_, i) => 100 - i * 0.2);
    const markAt = 137;
    const result = thinPoints(values, markAt);
    expect(result.markAt).not.toBeUndefined();
    expect(result.values[result.markAt as number]).toBe(values[markAt]);
  });

  it("не съедает провал стека — берёт самую отклонившуюся точку в шаге", () => {
    // Ровная линия на 100, единственный обвал до 5 в середине.
    const values = Array.from({ length: 300 }, (_, i) => (i === 150 ? 5 : 100));
    const result = thinPoints(values);
    expect(Math.min(...result.values)).toBe(5);
  });
});

describe("smoothValues", () => {
  it("снимает пилу, усредняя по трём соседям", () => {
    expect(smoothValues([10, 20, 10, 20, 10])).toEqual([10, 40 / 3, 50 / 3, 40 / 3, 10]);
  });

  it("не трогает концы — линия начинается и кончается на настоящих числах", () => {
    const result = smoothValues([100, 50, 40, 30, 5]);
    expect(result[0]).toBe(100);
    expect(result[result.length - 1]).toBe(5);
  });

  it("не трогает отмеченную раздачу: маркер обязан лежать на настоящем стеке", () => {
    const values = [100, 90, 12, 80, 70];
    expect(smoothValues(values, 2)[2]).toBe(12);
  });

  it("короткий ряд оставляет как есть", () => {
    expect(smoothValues([10, 20])).toEqual([10, 20]);
  });

  it("широкое окно глушит пилу сильнее узкого", () => {
    // Пила ±10 вокруг сотни: чем шире окно, тем ближе середина ряда к ровной линии.
    const saw = Array.from({ length: 41 }, (_, i) => (i % 2 === 0 ? 90 : 110));
    const spread = (values: number[]) => {
      const middle = values.slice(5, -5);
      return Math.max(...middle) - Math.min(...middle);
    };

    expect(spread(smoothValues(saw, undefined, 7))).toBeLessThan(spread(smoothValues(saw, undefined, 3)));
  });

  it("окно расширяется с длиной ряда", () => {
    expect(smoothingWindow(40)).toBe(3);
    expect(smoothingWindow(100)).toBe(5);
    expect(smoothingWindow(225)).toBe(7);
  });
});

describe("smoothPath", () => {
  const points = [
    { x: 0, y: 40 },
    { x: 10, y: 10 },
    { x: 20, y: 35 },
    { x: 30, y: 5 },
  ];

  it("строит кривую Безье, а не ломаную", () => {
    const path = smoothPath(points);
    expect(path.startsWith("M 0.0,40.0")).toBe(true);
    expect(path).toContain("C");
  });

  it("не выходит за пределы значений: контрольные точки зажаты между соседями", () => {
    const path = smoothPath(points);
    const ys = [...path.matchAll(/[-\d.]+,([-\d.]+)/g)].map((m) => Number(m[1]));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(minY);
    expect(Math.max(...ys)).toBeLessThanOrEqual(maxY);
  });

  it("на одной точке ничего не рисует", () => {
    expect(smoothPath([{ x: 0, y: 0 }])).toBe("");
  });
});

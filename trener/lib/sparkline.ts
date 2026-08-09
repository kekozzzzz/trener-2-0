// Математика спарклайна: прореживание длинного ряда и сглаживание ломаной.
// Живёт отдельно от компонента (components/site/sparkline.tsx) — чистые функции,
// которые можно прогнать тестами без рендера.
//
// Правка Артёма 2026-08-09: линия стека выглядела «слишком резкой». На турнире в
// 200+ раздач ломаная превращается в частокол: каждая раздача съедает блайнды и
// анте, и мелкая пила забивает форму. Лечим двумя приёмами — меньше точек и
// кубические кривые вместо углов. Правда данных при этом не страдает: провалы
// сохраняются, кривая не выходит за пределы реальных значений.

/** Сколько точек максимум рисуем. */
export const MAX_SPARKLINE_POINTS = 60;

/**
 * Прореживание: идём шагом по ряду и в каждом шаге берём не первую попавшуюся точку,
 * а самую удалённую от среднего — так провал стека остаётся провалом, а не
 * сглаживается в ровную горку. Первая, последняя и отмеченная точки сохраняются
 * всегда: иначе маркер съедет с реального значения.
 */
export function pickIndexes(values: number[], markAt?: number): number[] {
  if (values.length <= MAX_SPARKLINE_POINTS) return values.map((_, i) => i);

  const step = Math.ceil(values.length / MAX_SPARKLINE_POINTS);
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  const keep = new Set<number>([0, values.length - 1]);
  if (markAt != null) keep.add(markAt);

  for (let start = 0; start < values.length; start += step) {
    let peak = start;
    for (let i = start + 1; i < Math.min(start + step, values.length); i++) {
      if (Math.abs(values[i] - average) > Math.abs(values[peak] - average)) peak = i;
    }
    keep.add(peak);
  }

  return [...keep].sort((a, b) => a - b);
}

/** То же прореживание, но сразу значениями — для линий без интерактива. */
export function thinPoints(
  values: number[],
  markAt?: number
): { values: number[]; markAt?: number } {
  const indexes = pickIndexes(values, markAt);
  return {
    values: indexes.map((i) => values[i]),
    markAt: markAt != null ? indexes.indexOf(markAt) : undefined,
  };
}

/**
 * Лёгкое усреднение по трём соседям — снимает мелкую пилу, которую даёт списание
 * блайндов и анте каждую раздачу. Форма турнира (рост, обвал, восстановление)
 * остаётся: окно всего в одну точку по краям.
 *
 * Три значения не сглаживаются никогда: первое, последнее и отмеченное. Отмеченное —
 * принципиально: рядом с линией подписью стоит настоящий стек на этой раздаче, и
 * маркер обязан лежать ровно на нём, а не на усреднённом соседями числе.
 */
export function smoothValues(values: number[], keepIndex?: number): number[] {
  if (values.length < 3) return values;

  return values.map((value, i) => {
    if (i === 0 || i === values.length - 1 || i === keepIndex) return value;
    return (values[i - 1] + value + values[i + 1]) / 3;
  });
}

/**
 * Сглаживание ломаной кубическими кривыми (Catmull-Rom, переведённый в Безье).
 * Контрольные точки зажаты по вертикали между соседями — кривая не «выстреливает»
 * за пределы данных, то есть не рисует стек, которого не было.
 */
export function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length < 2) return "";

  const clamp = (value: number, a: number, b: number) =>
    Math.max(Math.min(a, b), Math.min(Math.max(a, b), value));

  let path = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const previous = points[i - 1] ?? points[i];
    const current = points[i];
    const next = points[i + 1];
    const after = points[i + 2] ?? next;

    const cp1 = {
      x: current.x + (next.x - previous.x) / 6,
      y: clamp(current.y + (next.y - previous.y) / 6, current.y, next.y),
    };
    const cp2 = {
      x: next.x - (after.x - current.x) / 6,
      y: clamp(next.y - (after.y - current.y) / 6, current.y, next.y),
    };

    path +=
      ` C ${cp1.x.toFixed(1)},${cp1.y.toFixed(1)}` +
      ` ${cp2.x.toFixed(1)},${cp2.y.toFixed(1)}` +
      ` ${next.x.toFixed(1)},${next.y.toFixed(1)}`;
  }

  return path;
}

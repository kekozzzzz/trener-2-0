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
export function pickIndexes(
  values: number[],
  markAt?: number,
  required: number[] = [],
  max = MAX_SPARKLINE_POINTS
): number[] {
  if (values.length <= max) return values.map((_, i) => i);

  const step = Math.ceil(values.length / max);
  const average = values.reduce((sum, v) => sum + v, 0) / values.length;
  const keep = new Set<number>([0, values.length - 1]);
  if (markAt != null) keep.add(markAt);
  // Точки, которые нельзя потерять при прореживании: на линии стека это разобранные
  // раздачи — они помечены и кликабельны, выброшенная метка означала бы пропавшую дверь.
  for (const index of required) {
    if (index >= 0 && index < values.length) keep.add(index);
  }

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
 * Усреднение по соседям — снимает мелкую пилу, которую даёт списание блайндов и анте
 * каждую раздачу. Форма турнира (рост, обвал, восстановление) остаётся.
 *
 * Окно тем шире, чем длиннее ряд: на двух сотнях раздач трёх соседей не хватает,
 * пила остаётся. Концы не трогаем никогда — линия обязана начинаться и заканчиваться
 * на настоящих числах. `keepIndex` оставляет нетронутой ещё одну точку (нужно там,
 * где маркер стоит без прореживания и должен совпасть со значением до знака).
 */
export function smoothValues(values: number[], keepIndex?: number, window = 3): number[] {
  if (values.length < 3) return values;

  const radius = Math.max(1, Math.floor(window / 2));

  return values.map((value, i) => {
    if (i === 0 || i === values.length - 1 || i === keepIndex) return value;

    // У краёв окно сжимается симметрично, иначе линия «подтягивается» к середине.
    const reach = Math.min(radius, i, values.length - 1 - i);
    let sum = 0;
    for (let j = i - reach; j <= i + reach; j++) sum += values[j];
    return sum / (reach * 2 + 1);
  });
}

/** Ширина окна усреднения под длину ряда: чем больше раздач, тем шире. */
export function smoothingWindow(length: number): number {
  if (length > 150) return 7;
  if (length > 60) return 5;
  return 3;
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

// 169-сетка стартовых рук как форма ответа игрока: раскладка ячеек, счёт
// комбинаций и компактная нотация выбранного диапазона. Правило 1: «N комбо · X%»
// — число, его считает код. Сам диапазон выбирает игрок (это его прочтение
// оппонента), не LLM и не парсер. Здесь нет покерных допущений «что правильно» —
// только арифметика 169-сетки.

import { RANK_CHARS, rankValue } from "./hand-codes";

// Ранги от старшего к младшему — порядок строк и столбцов сетки (как в трекерах:
// туз слева-сверху). Индекс 0 = туз … 12 = двойка.
export const GRID_RANKS = "AKQJT98765432";

export const TOTAL_COMBOS = 1326; // C(52,2)

// Код руки в ячейке (row, col), оба 0..12. Диагональ — пара, верх-право (row<col)
// — одномастные, низ-лево — разномастные (стандартная раскладка сетки).
export function cellCode(row: number, col: number): string {
  const hi = GRID_RANKS[Math.min(row, col)];
  const lo = GRID_RANKS[Math.max(row, col)];
  if (row === col) return hi + hi;
  return hi + lo + (row < col ? "s" : "o");
}

// Число комбинаций руки: пара — 6, одномастная — 4, разномастная — 12.
export function comboCount(code: string): number {
  if (code.length === 2) return 6;
  return code.endsWith("s") ? 4 : 12;
}

export function combosOf(codes: Iterable<string>): number {
  let total = 0;
  for (const c of codes) total += comboCount(c);
  return total;
}

export function percentOf(codes: Iterable<string>): number {
  return (combosOf(codes) / TOTAL_COMBOS) * 100;
}

// Группы подряд идущих значений рангов в массиве (по убыванию) — для свёртки в
// диапазоны нотации. Каждая группа: {hi, lo} в значениях ранга, hi >= lo.
function consecutiveRuns(desc: number[]): { hi: number; lo: number }[] {
  const runs: { hi: number; lo: number }[] = [];
  let i = 0;
  while (i < desc.length) {
    let j = i;
    while (j + 1 < desc.length && desc[j] - desc[j + 1] === 1) j++;
    runs.push({ hi: desc[i], lo: desc[j] });
    i = j + 1;
  }
  return runs;
}

function formatPairs(values: number[]): string[] {
  const desc = [...new Set(values)].sort((a, b) => b - a);
  const ace = rankValue("A");
  return consecutiveRuns(desc).map(({ hi, lo }) => {
    const hiC = RANK_CHARS[hi];
    const loC = RANK_CHARS[lo];
    if (hi === lo) return `${hiC}${hiC}`; // одиночная пара
    if (hi === ace) return `${loC}${loC}+`; // ряд из 2+ достаёт до тузов → «XX+»
    return `${hiC}${hiC}-${loC}${loC}`;
  });
}

function formatKickers(byHigh: Map<string, number[]>, suit: "s" | "o"): string[] {
  const out: string[] = [];
  const highs = [...byHigh.keys()].sort((a, b) => rankValue(b) - rankValue(a));
  for (const high of highs) {
    const maxKicker = rankValue(high) - 1; // старший возможный кикер для этой карты
    const desc = [...new Set(byHigh.get(high)!)].sort((a, b) => b - a);
    for (const { hi, lo } of consecutiveRuns(desc)) {
      const hiC = RANK_CHARS[hi];
      const loC = RANK_CHARS[lo];
      if (hi === lo) out.push(`${high}${hiC}${suit}`); // одиночная рука
      else if (hi === maxKicker) out.push(`${high}${loC}${suit}+`); // ряд из 2+ до старшего кикера → «+»
      else out.push(`${high}${hiC}${suit}-${high}${loC}${suit}`);
    }
  }
  return out;
}

// Компактная нотация выбранного диапазона: «99+, AJs+, KQs, AQo+». Пустой выбор → "".
export function formatRange(codes: Iterable<string>): string {
  const pairs: number[] = [];
  const suited = new Map<string, number[]>();
  const offsuit = new Map<string, number[]>();

  for (const code of new Set(codes)) {
    if (code.length === 2 && code[0] === code[1]) {
      pairs.push(rankValue(code[0]));
    } else if (code.length === 3) {
      const map = code[2] === "s" ? suited : offsuit;
      const arr = map.get(code[0]) ?? [];
      arr.push(rankValue(code[1]));
      map.set(code[0], arr);
    }
  }

  return [
    ...formatPairs(pairs),
    ...formatKickers(suited, "s"),
    ...formatKickers(offsuit, "o"),
  ].join(", ");
}

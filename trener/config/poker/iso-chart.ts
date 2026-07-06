// Чарт изоляции vs лимп по НАШЕЙ позиции. Правило 3: диапазоны в конфиге. Правило 1:
// попадание руки в ренж считает код. Уточнение Артёма 2026-07-01: изоляция ≈ RFI-опен,
// но ЧУТЬ У́ЖЕ — мелкие пары 22-66 уходят в ОВЕРЛИМП (не изоляцию), а мусорный низ
// фолдится. Поэтому iso-ренж = открытый RFI МИНУС пары 22-66. Остальное = как опен.
//
// Применение — подсказка «изолируешь лимпера слишком широкой рукой» (или мелкой парой,
// которую лучше оверлимпнуть). Граница с полосой допуска; флагаем явно лишнее.

import { withTolerance, isWiderThan } from "./hand-range";
import { rfiOpenRange, type OpenPosition } from "./rfi-chart";

const POSITIONS: OpenPosition[] = ["UTG", "MP", "HJ", "CO", "BTN", "SB"];
const POSITION_SET = new Set<string>(POSITIONS);

// Мелкие пары — в оверлимп, не в изоляцию (пометка Артёма «66- играются оверлимпом»).
const OVERLIMP_PAIRS = ["22", "33", "44", "55", "66"];

const ISO_RANGE = Object.fromEntries(
  POSITIONS.map((p) => {
    const s = new Set(rfiOpenRange(p));
    for (const pair of OVERLIMP_PAIRS) s.delete(pair);
    return [p, s];
  }),
) as Record<OpenPosition, Set<string>>;

// Допуск не возвращает оверлимп-пары обратно: 22-66 выкинуты из изоляции
// СОЗНАТЕЛЬНО (правило Артёма «мелкие пары — оверлимп»), это не граница чарта.
const ISO_TOLERANCE = Object.fromEntries(
  POSITIONS.map((p) => {
    const t = withTolerance(ISO_RANGE[p], 1);
    for (const pair of OVERLIMP_PAIRS) t.delete(pair);
    return [p, t];
  }),
) as Record<OpenPosition, Set<string>>;

export function isIsoPosition(pos: string): pos is OpenPosition {
  return POSITION_SET.has(pos);
}

// Изоляция «заметно шире нормы»: рука вне iso-ренжа (+допуск) для нашей позиции —
// слишком широкий iso либо мелкая пара, которую лучше оверлимпнуть. false = в норме.
export function isIsoSignificantlyWide(heroPos: string, code: string): boolean {
  if (!isIsoPosition(heroPos)) return false;
  return isWiderThan(ISO_RANGE[heroPos], ISO_TOLERANCE[heroPos], code);
}

// Слой клетки для страницы эталонного чарта (страница /charts): ISO — изолируй рейзом,
// OVERLIMP — мелкая пара: оверлимпни, не изолируй (изоляция ею флагается детектором —
// так и задумано), BORDER — граница допуска, OUT — фолд. Из тех же множеств, что
// детектор — страница и грейдер не могут разойтись.
export type IsoCellState = "ISO" | "OVERLIMP" | "BORDER" | "OUT";

const OVERLIMP_SET = new Set(OVERLIMP_PAIRS);

export function isoCellState(pos: OpenPosition, code: string): IsoCellState {
  if (OVERLIMP_SET.has(code)) return "OVERLIMP";
  if (ISO_RANGE[pos].has(code)) return "ISO";
  if (ISO_TOLERANCE[pos].has(code)) return "BORDER";
  return "OUT";
}

// Чарт сквиза по НАШЕЙ позиции: 3-бет поверх опена + как минимум одного коллера.
// Правило 3: диапазоны в конфиге. Правило 1: попадание руки в ренж считает код.
// Сквиз ТАЙТОВЕЕ обычного 3-бета и велью-тяжёлый: в банке уже есть коллер (у него
// свой диапазон), поэтому меньше блефов, упор на велью. Данные — beginner-баланс,
// упор на велью + минимум блеф-блокеров (стандартная теория сквиза + чарты Артёма).
//
// Применение — подсказка «сквиз шире нормы» (лёгкий сквиз мусором на микро = спью).
// Граница мягкая (велью + минимальный блеф весом), флагаем только явно лишнее.

import { buildRange, withTolerance, isWiderThan } from "./hand-range";
import { openChartPosition, type OpenPosition } from "./rfi-chart";

// Велью-сквиз (полный) — узкий, сильный.
const SQUEEZE_VALUE: Record<OpenPosition, string[]> = {
  UTG: ["QQ+", "AKs", "AKo", "AQs"],
  MP: ["QQ+", "AKs", "AKo", "AQs"],
  HJ: ["QQ+", "AKs", "AKo", "AQs"],
  CO: ["JJ+", "AKs", "AKo", "AQs", "AQo"],
  BTN: ["JJ+", "AKs", "AKo", "AQs", "AQo"],
  SB: ["QQ+", "AKs", "AKo", "AQs"],
};

// Блеф-сквиз (весовой) — только блокеры, немного.
const SQUEEZE_BLUFF: Record<OpenPosition, string[]> = {
  UTG: ["A5s", "A4s"],
  MP: ["A5s", "A4s"],
  HJ: ["A5s", "A4s", "KJs"],
  CO: ["A5s", "A4s", "KJs"],
  BTN: ["A5s", "A4s", "A3s", "KJs"],
  SB: ["A5s", "A4s"],
};

const POSITIONS: OpenPosition[] = ["UTG", "MP", "HJ", "CO", "BTN", "SB"];
const POSITION_SET = new Set<string>(POSITIONS);

const SQUEEZE_RANGE = Object.fromEntries(
  POSITIONS.map((p) => [p, buildRange([...SQUEEZE_VALUE[p], ...SQUEEZE_BLUFF[p]])]),
) as Record<OpenPosition, Set<string>>;

const SQUEEZE_TOLERANCE = Object.fromEntries(
  POSITIONS.map((p) => [p, withTolerance(SQUEEZE_RANGE[p], 1)]),
) as Record<OpenPosition, Set<string>>;

export function isSqueezePosition(pos: string): pos is OpenPosition {
  return POSITION_SET.has(pos);
}

export function squeezePosition(coarsePos: string, positionName?: string): OpenPosition | null {
  return openChartPosition(coarsePos, positionName);
}

// Сквиз «заметно шире нормы»: рука вне (велью ∪ блеф ∪ допуск) для нашей позиции —
// слишком лёгкий сквиз. false = сквиз в пределах нормы либо позицию не судим.
export function isSqueezeSignificantlyWide(heroPos: string, code: string): boolean {
  if (!isSqueezePosition(heroPos)) return false;
  return isWiderThan(SQUEEZE_RANGE[heroPos], SQUEEZE_TOLERANCE[heroPos], code);
}

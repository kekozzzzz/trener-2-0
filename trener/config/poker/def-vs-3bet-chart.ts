// Чарт защиты vs 3-бет по НАШЕЙ (открывавшей) позиции: 4-бет велью + блеф-блокеры.
// Правило 3: диапазоны в конфиге. Правило 1: попадание руки в ренж считает код.
// Мы открылись → в нас 3-бетнули → 4-бет/колл/фолд. Данные — beginner-баланс из его
// чартов «def vs 3bet» + стандарт: 4-бет узкий из ранней (AA/AKo/AQo), шире из late
// (+ оффсьют-бродвеи), блеф — блокеры A2s-A5s весом. Колл здесь НЕ грейдим (справка).
//
// Применение — подсказка «4-бет против 3-бета шире нормы» (спью-4-бет мусором). Граница
// мягкая (велью + бродвей + блеф-блокеры весом), флагаем только явно лишний 4-бет.

import { buildRange, withTolerance, isWiderThan } from "./hand-range";
import { openChartPosition, type OpenPosition } from "./rfi-chart";

// 4-бет велью (полное).
const FOURBET_VALUE: Record<OpenPosition, string[]> = {
  UTG: ["QQ+", "AKs", "AKo", "AQs", "AQo"],
  MP: ["QQ+", "AKs", "AKo", "AQs", "AQo"],
  HJ: ["JJ+", "AKs", "AKo", "AQs", "AQo", "KQo", "AJo"],
  CO: ["JJ+", "AKs", "AKo", "AQs", "AQo", "KQo", "AJo", "KJo", "ATo"],
  BTN: ["TT+", "AKs", "AKo", "AQs", "AQo", "KQo", "AJo", "KJo", "ATo", "KTo", "QJo"],
  SB: ["QQ+", "AKs", "AKo", "AQs", "AQo"],
};

// 4-бет блеф (весовой) — блокеры-тузы.
const FOURBET_BLUFF: Record<OpenPosition, string[]> = {
  UTG: ["A5s", "A4s"],
  MP: ["A5s", "A4s"],
  HJ: ["A5s", "A4s", "A3s"],
  CO: ["A5s", "A4s", "A3s", "A2s"],
  BTN: ["A5s", "A4s", "A3s", "A2s"],
  SB: ["A5s", "A4s"],
};

const POSITIONS: OpenPosition[] = ["UTG", "MP", "HJ", "CO", "BTN", "SB"];
const POSITION_SET = new Set<string>(POSITIONS);

const FOURBET_RANGE = Object.fromEntries(
  POSITIONS.map((p) => [p, buildRange([...FOURBET_VALUE[p], ...FOURBET_BLUFF[p]])]),
) as Record<OpenPosition, Set<string>>;

const FOURBET_TOLERANCE = Object.fromEntries(
  POSITIONS.map((p) => [p, withTolerance(FOURBET_RANGE[p], 1)]),
) as Record<OpenPosition, Set<string>>;

export function isDefVs3betPosition(pos: string): pos is OpenPosition {
  return POSITION_SET.has(pos);
}

export function defVs3betPosition(coarsePos: string, positionName?: string): OpenPosition | null {
  return openChartPosition(coarsePos, positionName);
}

// 4-бет против 3-бета «заметно шире нормы»: рука вне (велью ∪ блеф ∪ допуск) для нашей
// открывавшей позиции — спью-4-бет. false = 4-бет в пределах нормы либо не судим.
export function isFourBetSignificantlyWide(heroPos: string, code: string): boolean {
  if (!isDefVs3betPosition(heroPos)) return false;
  return isWiderThan(FOURBET_RANGE[heroPos], FOURBET_TOLERANCE[heroPos], code);
}

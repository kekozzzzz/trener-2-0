// Чарт БЛАЙНД-ПРОТИВ-БЛАЙНДА: защита BB против одиночного опен-рейза SB (фолд до SB).
// Отдельный от bb-defense-chart модуль: там SB-опен сознательно не покрыт, а «Твои
// чарты»/страница /charts этот спот пока не рисуют — чарт живёт только для вердикта
// тренера. Правило 3: диапазоны в конфиге. Правило 1: попадание в ренж считает код.
//
// Данные: среднее публичных источников (задание Артёма 2026-07-05):
//  1) Upswing (Defend BB vs SB open): SB открывает ~40%, BB против 3x нужно ~33%
//     эквити — защита сильно шире, чем против любой другой позиции.
//  2) PokerStrategy (BvB-структуры): BB «флэтит почти всё», 3-бет ~15%.
//  3) BBZ (BvB guide): структуры SB по стекам; подтверждает ширину и полярность.
// Beginner-обрезка как во всех чартах: солверный мусорный низ колла срезан.

import { buildRange, withTolerance, isWiderThan } from "./hand-range";

// 3-бет BB против опена SB: велью + блеф весом, суммарно ~15% (якорь PokerStrategy).
const BVB_THREEBET_VALUE = ["TT+", "AJs+", "AQo+", "KQs"];
const BVB_THREEBET_BLUFF = [
  "A2s", "A3s", "A4s", "A5s", "A8s", "A9s", "ATs",
  "K9s", "KTs", "QTs", "QJs", "JTs", "T9s", "98s", "87s", "76s",
  "A5o", "A4o", "ATo", "KJo", "KQo", "QJo",
];

// Колл (защита) BB против опена SB — самый широкий колл в игре (~55-60% с обрезкой).
const BVB_CALL = [
  "22+", "A2s+", "K2s+", "Q2s+", "J4s+", "T5s+", "95s+", "84s+", "74s+", "63s+", "53s+", "43s",
  "A2o+", "K4o+", "Q6o+", "J7o+", "T7o+", "97o+", "87o",
];
// Весовые пограничные («иногда, по сопернику и цене»).
const BVB_CALL_WEIGHTED = ["J2s", "J3s", "T3s", "T4s", "94s", "83s", "73s", "62s", "52s", "42s", "K2o", "K3o", "Q4o", "Q5o", "J6o", "T6o", "96o", "86o", "76o"];

const THREEBET_RANGE = buildRange([...BVB_THREEBET_VALUE, ...BVB_THREEBET_BLUFF]);
const THREEBET_TOLERANCE = withTolerance(THREEBET_RANGE, 1);
const THREEBET_VALUE_SET = buildRange(BVB_THREEBET_VALUE);
const CALL_RANGE = buildRange(BVB_CALL);
const CALL_WEIGHTED_SET = new Set(BVB_CALL_WEIGHTED);

// 3-бет BvB «заметно шире нормы»: вне (велью ∪ блеф ∪ допуск).
export function isBvbThreeBetSignificantlyWide(code: string): boolean {
  return isWiderThan(THREEBET_RANGE, THREEBET_TOLERANCE, code);
}

export type BvbCellState = "THREEBET" | "THREEBET_BLUFF" | "CALL" | "CALL_SOMETIMES" | "FOLD";

export function bvbCellState(code: string): BvbCellState {
  if (THREEBET_VALUE_SET.has(code)) return "THREEBET";
  if (THREEBET_RANGE.has(code)) return "THREEBET_BLUFF";
  if (CALL_WEIGHTED_SET.has(code)) return "CALL_SOMETIMES";
  if (CALL_RANGE.has(code)) return "CALL";
  return "FOLD";
}

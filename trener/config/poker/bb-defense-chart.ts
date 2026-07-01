// Чарт защиты BB по позиции ОТКРЫВАШКИ (колл / 3-бет / вес) — источник правды
// «как защищать большой блайнд против одиночного опена ~2.5bb». Правило 3: диапазоны
// в конфиге. Правило 1: попадание руки в ренж — число, его считает код, не LLM.
//
// Данные: beginner-баланс, среднее между солверными чартами Артёма (coach-materials
// «Def BB», блок 2.5bb) и публичными MTT-источниками; сырой солверный «тонкий мусор»
// обрезан. Утверждено 2026-06-30.
//
// Ключевое применение — подсказка «3-бет ШИРЕ нормы из BB» (зеркало open-leak по RFI):
// граница 3-бета МЯГКАЯ (велью + блеф весом), грейдер цепляется только к 3-бету ВНЕ неё
// (явный спью). Блеф весом ⇒ новичку не советуем спьюить, но легитимный блок-3-бет
// (A5s) НЕ флагаем. Веса колла/блефа — задел под показометр, грейдер их не флагает.

import { buildRange, withTolerance, isWiderThan } from "./hand-range";
import { openChartPosition } from "./rfi-chart";

// Позиция открывашки, против которой защищается BB. SB-опен vs BB — блайнд-vs-блайнд,
// отдельный спот, здесь НЕ покрыт (в сомнении не судим).
export type OpenerPosition = "UTG" | "MP" | "HJ" | "CO" | "BTN";

// 3-бет из BB: велью (полное) + блеф (весовой). Граница «шире нормы» = велью ∪ блеф.
const THREEBET_VALUE: Record<OpenerPosition, string[]> = {
  UTG: ["QQ+", "AKs", "AKo"],
  MP: ["QQ+", "AKs", "AKo"],
  HJ: ["QQ+", "AKs", "AKo", "AQs"],
  CO: ["QQ+", "AKs", "AKo", "AQs"],
  BTN: ["JJ+", "AKs", "AKo", "AQs"],
};

const THREEBET_BLUFF: Record<OpenerPosition, string[]> = {
  UTG: ["A5s", "A4s", "KJs", "JTs"],
  MP: ["A5s", "A4s", "KJs", "JTs", "T9s"],
  HJ: ["A5s", "A4s", "A3s", "KJs", "JTs", "T9s", "76s"],
  CO: ["A5s", "A4s", "A3s", "KJs", "K9s", "JTs", "T9s", "76s", "65s"],
  BTN: ["A5s", "A4s", "A3s", "A2s", "KTs", "K9s", "QTs", "JTs", "T9s", "98s", "87s", "76s"],
};

// Колл (флэт) из BB + весовые пограничные. Задел под показометр (пока грейдер их не
// использует). Премиумы из THREEBET_VALUE имеют приоритет — при показе вычитать.
export const BB_CALL: Record<OpenerPosition, string[]> = {
  UTG: ["22+", "A2s+", "K8s+", "Q9s+", "J9s+", "T8s+", "97s+", "87s", "76s", "65s", "54s", "ATo+", "KTo+", "QJo", "QTo", "JTo"],
  MP: ["22+", "A2s+", "K7s+", "Q8s+", "J8s+", "T8s+", "97s+", "86s+", "76s", "65s", "54s", "A9o+", "KTo+", "QJo", "QTo", "JTo"],
  HJ: ["22+", "A2s+", "K5s+", "Q7s+", "J7s+", "T7s+", "96s+", "86s+", "75s+", "65s", "54s", "A7o+", "KTo+", "QJo", "QTo", "JTo", "T9o"],
  CO: ["22+", "A2s+", "K4s+", "Q6s+", "J6s+", "T6s+", "95s+", "85s+", "74s+", "64s+", "54s", "A5o+", "K8o+", "Q9o+", "JTo", "T9o", "98o"],
  BTN: ["22+", "A2s+", "K2s+", "Q4s+", "J6s+", "T6s+", "95s+", "85s+", "74s+", "64s+", "53s+", "A2o+", "K6o+", "Q8o+", "J8o+", "T8o+", "98o"],
};

export const BB_CALL_WEIGHTED: Record<OpenerPosition, string[]> = {
  UTG: ["K7s", "Q8s", "J8s", "T7s", "96s", "75s", "64s", "A9o"],
  MP: ["K6s", "Q7s", "J7s", "T7s", "96s", "75s", "64s", "A8o"],
  HJ: ["K4s", "Q6s", "J6s", "T6s", "85s", "74s", "64s", "A5o", "A6o", "K9o", "J9o"],
  CO: ["K3s", "Q5s", "J5s", "T5s", "84s", "63s", "53s", "A4o", "K7o", "Q8o", "J9o"],
  BTN: ["Q3s", "J5s", "T5s", "84s", "63s", "A2o", "A3o", "K5o", "Q7o", "J7o", "T7o"],
};

const OPENERS: OpenerPosition[] = ["UTG", "MP", "HJ", "CO", "BTN"];
const OPENER_SET = new Set<string>(OPENERS);

// Полная граница «нормального 3-бета» = велью ∪ блеф; + полоса допуска в 1 шаг.
const THREEBET_RANGE: Record<OpenerPosition, Set<string>> = Object.fromEntries(
  OPENERS.map((p) => [p, buildRange([...THREEBET_VALUE[p], ...THREEBET_BLUFF[p]])]),
) as Record<OpenerPosition, Set<string>>;

const THREEBET_TOLERANCE: Record<OpenerPosition, Set<string>> = Object.fromEntries(
  OPENERS.map((p) => [p, withTolerance(THREEBET_RANGE[p], 1)]),
) as Record<OpenerPosition, Set<string>>;

export function isOpenerPosition(pos: string): pos is OpenerPosition {
  return OPENER_SET.has(pos);
}

// Позиция открывашки для чарта защиты BB из снимка (грубая + точная). Ранние сводим
// к UTG/MP через тот же openChartPosition, что и RFI; SB-опен/несудимые → null.
export function bbDefenseOpener(coarsePos: string, positionName?: string): OpenerPosition | null {
  const p = openChartPosition(coarsePos, positionName);
  return p && isOpenerPosition(p) ? p : null;
}

// 3-бет из BB «заметно шире нормы»: рука вне (велью ∪ блеф ∪ допуск) для этой позиции
// открывашки. false = 3-бет в пределах нормы либо позицию не судим.
export function isBBThreeBetSignificantlyWide(openerPos: string, code: string): boolean {
  if (!isOpenerPosition(openerPos)) return false;
  return isWiderThan(THREEBET_RANGE[openerPos], THREEBET_TOLERANCE[openerPos], code);
}

// Чарт пуш-фолда (опен-шов «первым в банк» на коротком стеке) по позиции × стек-бэнду.
// Правило 3: диапазоны в конфиге. Правило 1: попадание руки в ренж — число, его
// считает код, не LLM. Пуш-фолд — объективный Nash-спот; данные сняты с Nash-чартов
// Артёма (12 гридов) и сверены с публичным Nash (см. memory/project_push_fold_chart).
//
// Применение — подсказка «опен-шов ШИРЕ нормы» (зеркало open-leak): рука вне пуш-ренжа
// для стека/позиции = слишком широкий пуш. Граница с полосой допуска (не флагаем за
// пару клеток). Колл BB vs пуш здесь как ДАННЫЕ (грейдер пока только на опен-шов).

import { buildRange, withTolerance, isWiderThan } from "./hand-range";

// Позиции пуш-чарта Артёма (без HJ; HJ сводим к CO при резолве). SB — опен-шов SB.
export type PushPosition = "UTG" | "MP2" | "CO" | "BTN" | "SB";
// Стек-бэнд: SHORT = 0–9bb (шире), MID = 10–14bb (тайтовее). ≥15bb — уже опен-рейз.
export type StackBand = "SHORT" | "MID";

const PUSH_RAW: Record<StackBand, Record<PushPosition, string[]>> = {
  SHORT: {
    UTG: ["55+", "A5s+", "KTs+", "QTs+", "JTs", "A9o+", "KQo"],
    MP2: ["33+", "A2s+", "K8s+", "Q9s+", "J9s+", "T9s", "A5o+", "KTo+", "QJo"],
    CO: ["22+", "A2s+", "K3s+", "Q7s+", "J7s+", "T7s+", "96s+", "86s+", "76s", "A2o+", "K8o+", "Q9o+", "JTo", "T9o"],
    BTN: ["22+", "A2s+", "K2s+", "Q2s+", "J5s+", "T6s+", "96s+", "85s+", "75s+", "64s+", "A2o+", "K4o+", "Q7o+", "J8o+", "T8o", "98o"],
    SB: ["22+", "A2s+", "K2s+", "Q2s+", "J2s+", "T4s+", "95s+", "84s+", "74s+", "64s+", "53s+", "A2o+", "K2o+", "Q4o+", "J7o+", "T7o+"],
  },
  MID: {
    UTG: ["66+", "ATs+", "KTs+", "QTs+", "JTs", "AJo+"],
    MP2: ["44+", "A9s+", "K9s+", "Q9s+", "J9s+", "T9s", "A9o+", "KJo+"],
    CO: ["22+", "A2s+", "K7s+", "Q9s+", "J9s+", "T8s+", "98s", "A7o+", "K9o+", "QJo", "JTo"],
    BTN: ["22+", "A2s+", "K2s+", "Q5s+", "J7s+", "T7s+", "97s+", "86s+", "76s", "A2o+", "K7o+", "Q9o+", "JTo", "T9o"],
    SB: ["22+", "A2s+", "K2s+", "Q4s+", "J6s+", "T6s+", "96s+", "85s+", "75s+", "64s+", "A2o+", "K5o+", "Q8o+", "J8o+", "T8o"],
  },
};

// Колл BB против пуша 10bb (данные под будущий грейдер/показ; сейчас не используется).
export const BB_CALL_VS_PUSH: Record<"vsUTG" | "vsBTN", string[]> = {
  vsUTG: ["66+", "ATs+", "KQs", "AQo+"],
  vsBTN: ["22+", "A2s+", "K7s+", "Q9s+", "J9s+", "T9s", "A7o+", "KTo+", "QJo"],
};

const PUSH_POSITIONS: PushPosition[] = ["UTG", "MP2", "CO", "BTN", "SB"];
const PUSH_POSITION_SET = new Set<string>(PUSH_POSITIONS);

const PUSH_RANGE: Record<StackBand, Record<PushPosition, Set<string>>> = {
  SHORT: rangesFor("SHORT"),
  MID: rangesFor("MID"),
};
const PUSH_TOLERANCE: Record<StackBand, Record<PushPosition, Set<string>>> = {
  SHORT: tolFor("SHORT"),
  MID: tolFor("MID"),
};
function rangesFor(band: StackBand) {
  return Object.fromEntries(PUSH_POSITIONS.map((p) => [p, buildRange(PUSH_RAW[band][p])])) as Record<PushPosition, Set<string>>;
}
function tolFor(band: StackBand) {
  return Object.fromEntries(PUSH_POSITIONS.map((p) => [p, withTolerance(PUSH_RANGE[band][p], 1)])) as Record<PushPosition, Set<string>>;
}

// Стек-бэнд по стеку в BB: <10 → SHORT, 10–14 → MID, ≥15 → null (уже опен-рейз, не пуш).
export function stackBandFor(stackBb: number): StackBand | null {
  if (stackBb < 10) return "SHORT";
  if (stackBb < 15) return "MID";
  return null;
}

// Позиция пуш-чарта из грубой позиции + точного имени. EARLY: UTG → UTG, прочие
// ранние (UTG+1/LJ) → MP2. HJ сводим к CO (чарта HJ нет; CO шире → грейдер лояльнее).
// BB/OTHER → null (первым в банк не пушат).
export function pushPosition(coarsePos: string, positionName?: string): PushPosition | null {
  if (coarsePos === "BTN" || coarsePos === "SB" || coarsePos === "CO") return coarsePos;
  if (coarsePos === "HJ") return "CO";
  if (coarsePos === "EARLY") return positionName === "UTG" ? "UTG" : "MP2";
  return null;
}

export function isPushPosition(pos: string): pos is PushPosition {
  return PUSH_POSITION_SET.has(pos);
}

// Опен-шов «заметно шире нормы»: рука вне пуш-ренжа (+допуск) для этого стека и
// позиции. false = пуш в пределах нормы либо спот не судим.
export function isOpenShoveSignificantlyWide(band: StackBand, pos: string, code: string): boolean {
  if (!isPushPosition(pos)) return false;
  return isWiderThan(PUSH_RANGE[band][pos], PUSH_TOLERANCE[band][pos], code);
}

// Слой клетки для страницы эталонного чарта (страница /charts): ALWAYS — пуш,
// BORDER — граница допуска (не ошибка, но не рекомендация), OUT — фолд. Весового
// слоя у пуш-фолда нет — Nash-спот бинарный. Та же математика, что у детектора
// isOpenShoveSignificantlyWide — страница и грейдер не могут разойтись.
export type PushCellState = "ALWAYS" | "BORDER" | "OUT";

export function pushCellState(band: StackBand, pos: PushPosition, code: string): PushCellState {
  if (PUSH_RANGE[band][pos].has(code)) return "ALWAYS";
  if (PUSH_TOLERANCE[band][pos].has(code)) return "BORDER";
  return "OUT";
}

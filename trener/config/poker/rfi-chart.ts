// RFI-чарт открытия (raise-first-in) — источник правды «что открывать нормально».
// Правило 3: покерные диапазоны живут в конфиге, не в коде логики. Правило 1/2:
// «попадание руки в чарт» — это число, его считает код по выверенному источнику,
// а не LLM по памяти (журнал решений 2026-06-19 откладывал это «до источника» —
// источник = baseline ниже).
//
// Baseline утверждён Артёмом 2026-06-20 (plans/2026-06-20-режим-тренировка.md),
// 8-max МТТ ~40bb с анте, умышленно уже личного чарта. Тот же чарт переиспользует
// режим «Тренировка» — единый источник правды.
//
// Оговорки движка: EARLY = склейка UTG/MP (парсер не различает) → самый тайтовый,
// UTG-вариант. SB — только рейз/фолд. BB не открывает.

import { RANK_CHARS, rankValue } from "./hand-codes";

export type OpenPosition = "EARLY" | "HJ" | "CO" | "BTN" | "SB";

// Сырьё в «+»-нотации (как утверждено). Разворачивается в полные коды ниже.
const RFI_RAW: Record<OpenPosition, string[]> = {
  EARLY: ["22+", "A2s+", "KTs+", "QTs+", "JTs", "T9s", "98s", "87s", "76s", "AJo+", "KQo"],
  HJ: ["22+", "A2s+", "K9s+", "Q9s+", "J9s", "T9s", "98s", "87s", "76s", "65s", "54s", "ATo+", "KJo+", "QJo"],
  CO: ["22+", "A2s+", "K7s+", "Q9s+", "J9s", "T8s+", "98s", "87s", "76s", "65s", "54s", "A9o+", "KTo+", "QJo", "JTo"],
  BTN: ["22+", "A2s+", "K4s+", "Q7s+", "J8s+", "T8s+", "97s+", "86s+", "75s+", "64s+", "54s", "A2o+", "K9o+", "Q9o+", "J9o+", "T9o"],
  SB: ["22+", "A2s+", "K6s+", "Q8s+", "J8s+", "T8s+", "97s+", "86s+", "75s+", "65s", "54s", "A5o+", "K9o+", "Q9o+", "J9o+"],
};

// На сколько шагов вниз по младшей карте расширяем «допуск»: рука в допуске —
// граничная, её НЕ называем; рука вне допуска — «заметно шире», её называем.
// Требование Артёма: граничные не трогаем, пишем только сильно шире ренжа.
export const TOLERANCE_STEP = 1;

// Минимальный стек Hero (BB), при котором применим RFI-чарт. Короче — это уже
// пуш-фолд (другой чарт, не построен) → открытие не судим (в сомнении не флагать).
export const OPEN_MIN_STACK_BB = 20;

// Разворачивает один токен «+»-нотации в список кодов руки.
function expand(token: string): string[] {
  const plus = token.endsWith("+");
  const body = plus ? token.slice(0, -1) : token;

  // Пара: "77" / "77+".
  if (body.length === 2 && body[0] === body[1]) {
    const from = rankValue(body[0]);
    const to = plus ? rankValue("A") : from;
    const out: string[] = [];
    for (let v = from; v <= to; v++) out.push(RANK_CHARS[v] + RANK_CHARS[v]);
    return out;
  }

  // Одномастные/разномастные: "KTs", "A2s+", "KQo", "K9o+".
  const high = body[0];
  const low = body[1];
  const suit = body[2]; // 's' | 'o'
  const highV = rankValue(high);
  const fromV = rankValue(low);
  const toV = plus ? highV - 1 : fromV; // "+" тянет младшую карту вверх до (старшая−1)
  const out: string[] = [];
  for (let v = fromV; v <= toV; v++) out.push(high + RANK_CHARS[v] + suit);
  return out;
}

function buildRange(tokens: string[]): Set<string> {
  const set = new Set<string>();
  for (const t of tokens) for (const c of expand(t)) set.add(c);
  return set;
}

// Расширяет диапазон на TOLERANCE_STEP шагов вниз по младшей карте (пары не
// трогаем — все пары и так в открытии через 22+). Даёт «граничную» полосу.
function withTolerance(open: Set<string>, step: number): Set<string> {
  const tol = new Set(open);
  for (const code of open) {
    if (code.length !== 3) continue; // пропускаем пары
    const high = code[0];
    const suit = code[2];
    const lowV = rankValue(code[1]);
    const highV = rankValue(high);
    for (let s = 1; s <= step; s++) {
      const v = lowV - s;
      if (v >= 0 && v < highV) tol.add(high + RANK_CHARS[v] + suit);
    }
  }
  return tol;
}

const OPEN_RANGE: Record<OpenPosition, Set<string>> = {
  EARLY: buildRange(RFI_RAW.EARLY),
  HJ: buildRange(RFI_RAW.HJ),
  CO: buildRange(RFI_RAW.CO),
  BTN: buildRange(RFI_RAW.BTN),
  SB: buildRange(RFI_RAW.SB),
};

const TOLERANCE_RANGE: Record<OpenPosition, Set<string>> = {
  EARLY: withTolerance(OPEN_RANGE.EARLY, TOLERANCE_STEP),
  HJ: withTolerance(OPEN_RANGE.HJ, TOLERANCE_STEP),
  CO: withTolerance(OPEN_RANGE.CO, TOLERANCE_STEP),
  BTN: withTolerance(OPEN_RANGE.BTN, TOLERANCE_STEP),
  SB: withTolerance(OPEN_RANGE.SB, TOLERANCE_STEP),
};

const OPEN_POSITIONS = new Set<string>(["EARLY", "HJ", "CO", "BTN", "SB"]);

export function isOpenPosition(position: string): position is OpenPosition {
  return OPEN_POSITIONS.has(position);
}

// Открытие «заметно шире» нормы: рука вне открытого диапазона И вне граничной
// полосы допуска. Позиции вне чарта (BB/OTHER) не судим. Пары никогда не шире
// (все в 22+). false = открывать такое нормально либо нельзя судить.
export function isOpenSignificantlyWide(position: string, code: string): boolean {
  if (!isOpenPosition(position)) return false;
  if (OPEN_RANGE[position].has(code)) return false;
  if (TOLERANCE_RANGE[position].has(code)) return false;
  return true;
}

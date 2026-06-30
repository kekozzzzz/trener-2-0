// RFI-чарт открытия (raise-first-in) — источник правды «что открывать нормально».
// Правило 3: покерные диапазоны живут в конфиге, не в коде логики. Правило 1/2:
// «попадание руки в чарт» — это число, его считает код по выверенному источнику,
// а не LLM по памяти (журнал решений 2026-06-19 откладывал это «до источника» —
// источник = baseline ниже).
//
// ОБНОВЛЕНО 2026-06-29: ренжи пересобраны как СРЕДНЕЕ между реальными чартами Артёма
// (coach-materials/«Ренджы префлоп free pos», сняты пиксельно с сеток 13x13) и
// публичными MTT 40bb-чартами (bbzpoker.com/preflop-strategy-tournament-poker,
// pokercoaching.com/preflop-charts — проценты по позициям: UTG~17 / MP~19 / HJ~28 /
// CO~36 / BTN~51). Правило 1: диапазоны из РЕАЛЬНЫХ источников, не из памяти модели.
//
// Оговорки движка: ранние позиции РАЗВЕДЕНЫ на UTG/MP через openChartPosition() по
// positionName из снимка (грубая position=EARLY больше не используется чартом). UTG —
// первый ход после BB (чуть тайтовее по офсьюту); MP — прочие ранние (UTG+1/LJ, шире).
// SB: этот список — РЕЙЗ-рейндж (сильные руки рейзят
// 3-3.5bb); слабые руки на SB при фолде до тебя ЛИМПЯТ (см. hand-analysis.ts, блок
// про лимпы), а не фолдят — SB-лимп тут НЕ утечка. BB не открывает.
//
// RFI_WEIGHTED — маргинальные «весовые» руки (~50%, открываем не всегда: зависит от
// стека/оппов/ICM, новичку их тяжело реализовать). Грейдер их НЕ флагает (они внутри
// RFI_RAW); набор — задел под показометр/тренажёр, где покажем как «иногда».

import { RANK_CHARS, rankValue } from "./hand-codes";

export type OpenPosition = "UTG" | "MP" | "HJ" | "CO" | "BTN" | "SB";

// Ранние места (грубая position = EARLY) разводим по точному positionName из снимка:
// «UTG» (первый ход после BB) → UTG; прочие ранние (UTG+1/UTG+2/LJ) → MP. На 6-max
// единственная ранняя приходит как «LJ» → MP (шире = грейдер не флагает ложно).
// HJ/CO/BTN/SB — как есть; BB/OTHER → null (RFI-чартом не судим). Чистая функция.
export function openChartPosition(coarse: string, positionName?: string): OpenPosition | null {
  if (coarse === "HJ" || coarse === "CO" || coarse === "BTN" || coarse === "SB") return coarse;
  if (coarse === "EARLY") return positionName === "UTG" ? "UTG" : "MP";
  return null;
}

// Сырьё в «+»-нотации (как утверждено). Разворачивается в полные коды ниже.
const RFI_RAW: Record<OpenPosition, string[]> = {
  // UTG — самый ранний (чуть тайтовее по офсьюту); MP — остальные ранние (шире).
  UTG: ["22+", "A2s+", "K6s+", "Q8s+", "J8s+", "T8s+", "97s+", "87s", "76s", "65s", "54s", "ATo+", "KTo+", "QJo"],
  MP: ["22+", "A2s+", "K6s+", "Q8s+", "J8s+", "T8s+", "97s+", "87s", "76s", "65s", "54s", "A9o+", "KTo+", "QJo", "JTo"],
  HJ: ["22+", "A2s+", "K4s+", "Q6s+", "J6s+", "T6s+", "96s+", "85s+", "75s+", "64s+", "54s", "A7o+", "KTo+", "QTo+", "JTo", "T9o"],
  CO: ["22+", "A2s+", "K3s+", "Q5s+", "J6s+", "T6s+", "96s+", "86s+", "75s+", "64s+", "54s", "A4o+", "K9o+", "Q9o+", "JTo", "T9o", "98o"],
  BTN: ["22+", "A2s+", "K2s+", "Q3s+", "J5s+", "T6s+", "95s+", "85s+", "74s+", "64s+", "53s+", "A2o+", "K6o+", "Q8o+", "J8o+", "T8o+", "98o", "87o"],
  SB: ["22+", "A2s+", "K6s+", "Q8s+", "J8s+", "T8s+", "97s+", "86s+", "75s+", "65s", "54s", "A5o+", "K9o+", "Q9o+", "J9o+"],
};

// Весовые (маргинальные) руки — подмножество RFI_RAW, открываем ~50%. Грейдер их НЕ
// флагает (они в ренже). Задел под показометр/тренажёр. См. шапку файла.
export const RFI_WEIGHTED: Record<OpenPosition, string[]> = {
  UTG: ["22", "33", "K6s", "Q8s", "J8s", "65s", "54s"],
  MP: ["22", "33", "K6s", "Q8s", "J8s", "65s", "54s", "JTo"],
  HJ: ["22", "33", "K4s", "Q6s", "64s", "54s"],
  CO: ["K3s", "Q5s", "64s", "54s", "98o"],
  BTN: ["Q3s", "J5s", "74s", "53s", "87o", "98o"],
  SB: ["54s", "65s", "J8s"],
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
  UTG: buildRange(RFI_RAW.UTG),
  MP: buildRange(RFI_RAW.MP),
  HJ: buildRange(RFI_RAW.HJ),
  CO: buildRange(RFI_RAW.CO),
  BTN: buildRange(RFI_RAW.BTN),
  SB: buildRange(RFI_RAW.SB),
};

const TOLERANCE_RANGE: Record<OpenPosition, Set<string>> = {
  UTG: withTolerance(OPEN_RANGE.UTG, TOLERANCE_STEP),
  MP: withTolerance(OPEN_RANGE.MP, TOLERANCE_STEP),
  HJ: withTolerance(OPEN_RANGE.HJ, TOLERANCE_STEP),
  CO: withTolerance(OPEN_RANGE.CO, TOLERANCE_STEP),
  BTN: withTolerance(OPEN_RANGE.BTN, TOLERANCE_STEP),
  SB: withTolerance(OPEN_RANGE.SB, TOLERANCE_STEP),
};

const OPEN_POSITIONS = new Set<string>(["UTG", "MP", "HJ", "CO", "BTN", "SB"]);

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

// Общие хелперы диапазонов в «+»-нотации — переиспользуются чартами (RFI, защита BB,
// и т.д.). Правило 3: покерные диапазоны живут в конфиге. Чистые функции, без БД.
// (RFI-чарт исторически держит свои копии; новые чарты берут отсюда.)

import { RANK_CHARS, rankValue } from "./hand-codes";

// Разворачивает один токен «+»-нотации в список кодов руки:
//  "22+" → 22,33,…,AA;  "A2s+" → A2s,A3s,…,AKs;  "KQo" → KQo;  "JTs" → JTs.
export function expandToken(token: string): string[] {
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

export function buildRange(tokens: string[]): Set<string> {
  const set = new Set<string>();
  for (const t of tokens) for (const c of expandToken(t)) set.add(c);
  return set;
}

// Расширяет диапазон на `step` шагов вниз по младшей карте (пары не трогаем — они
// уже покрыты явно). Даёт «граничную» полосу допуска: руку в ней не флагаем.
export function withTolerance(range: Set<string>, step: number): Set<string> {
  const tol = new Set(range);
  for (const code of range) {
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

// Рука «заметно шире» нормы: вне основного диапазона И вне полосы допуска.
export function isWiderThan(range: Set<string>, tolerance: Set<string>, code: string): boolean {
  if (range.has(code)) return false;
  if (tolerance.has(code)) return false;
  return true;
}

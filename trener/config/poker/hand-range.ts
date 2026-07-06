// Общие хелперы диапазонов в «+»-нотации — переиспользуются чартами (RFI, защита BB,
// и т.д.). Правило 3: покерные диапазоны живут в конфиге. Чистые функции, без БД.
// (RFI-чарт исторически держит свои копии; новые чарты берут отсюда.)

import { RANK_CHARS, rankValue } from "./hand-codes";

// Разворачивает один токен «+»-нотации в список кодов руки:
//  "22+" → 22,33,…,AA;  "A2s+" → A2s,A3s,…,AKs;  "KQo" → KQo;  "JTs" → JTs.
// «−»-интервалы (их выдаёт formatRange сетки): "QQ-99" → QQ,JJ,TT,99;
//  "A9s-A6s" → A9s,A8s,A7s,A6s (старшая карта и масть совпадают).
export function expandToken(token: string): string[] {
  const dash = token.indexOf("-");
  if (dash > 0) {
    const hi = token.slice(0, dash);
    const lo = token.slice(dash + 1);
    // Пары: "QQ-99" — идём по достоинству пары вниз.
    if (hi.length === 2 && hi[0] === hi[1] && lo.length === 2 && lo[0] === lo[1]) {
      const out: string[] = [];
      for (let v = rankValue(hi[0]); v >= rankValue(lo[0]); v--) out.push(RANK_CHARS[v] + RANK_CHARS[v]);
      return out;
    }
    // Кикеры: "A9s-A6s" — старшая и масть общие, младшая идёт вниз.
    if (hi.length === 3 && lo.length === 3 && hi[0] === lo[0] && hi[2] === lo[2]) {
      const out: string[] = [];
      for (let v = rankValue(hi[1]); v >= rankValue(lo[1]); v--) out.push(hi[0] + RANK_CHARS[v] + hi[2]);
      return out;
    }
    return []; // кривой интервал — не угадываем
  }

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

// Строгий разбор нотации диапазона из ОТВЕТА ИГРОКА (сетка пишет её в текст ответа:
// «99+, AJs+, A9s-A6s, KQo»). Это пользовательский ввод — каждый токен валидируется
// жёстко, кривая строка целиком отбрасывается (не угадываем). Возвращает канонические
// коды 169-сетки без повторов; пусто — нотация не распознана.
const PAIR_RE = /^([2-9TJQKA])\1$/;
const KICKER_RE = /^([2-9TJQKA])([2-9TJQKA])[so]$/;

function validRangeToken(token: string): boolean {
  const dash = token.indexOf("-");
  if (dash > 0) {
    const hi = token.slice(0, dash);
    const lo = token.slice(dash + 1);
    if (PAIR_RE.test(hi) && PAIR_RE.test(lo)) return rankValue(hi[0]) > rankValue(lo[0]);
    if (KICKER_RE.test(hi) && KICKER_RE.test(lo))
      return (
        hi[0] === lo[0] &&
        hi[2] === lo[2] &&
        rankValue(hi[0]) > rankValue(hi[1]) &&
        rankValue(hi[1]) > rankValue(lo[1])
      );
    return false;
  }
  const plus = token.endsWith("+");
  const body = plus ? token.slice(0, -1) : token;
  if (PAIR_RE.test(body)) return true;
  if (KICKER_RE.test(body)) return rankValue(body[0]) > rankValue(body[1]);
  return false;
}

export function parseRangeNotation(text: string): string[] {
  const tokens = text.split(",").map((t) => t.trim()).filter(Boolean);
  // 169 кодов — максимум осмысленного; больше токенов, чем кодов, — мусор.
  if (tokens.length === 0 || tokens.length > 169) return [];
  const set = new Set<string>();
  for (const t of tokens) {
    if (!validRangeToken(t)) return [];
    for (const c of expandToken(t)) set.add(c);
  }
  return [...set];
}

// Расширяет диапазон на `step` шагов вниз: у кикер-рук — по младшей карте, у ПАР — на
// пару ниже (JJ в диапазоне → TT в допуске). Раньше пары сознательно пропускались —
// и «соседняя пара снизу» летела в «заметно шире нормы» во всех грейдерах сразу
// (ревизия чартов 2026-07-06: JJ при границе QQ+ жёстко флагался). Полоса допуска —
// «не ошибка, но и не рекомендация».
export function withTolerance(range: Set<string>, step: number): Set<string> {
  const tol = new Set(range);
  for (const code of range) {
    if (code.length === 2 && code[0] === code[1]) {
      // пара: допуск — пары на step ниже
      const v0 = rankValue(code[0]);
      for (let s = 1; s <= step; s++) {
        const v = v0 - s;
        if (v >= 0) tol.add(RANK_CHARS[v] + RANK_CHARS[v]);
      }
      continue;
    }
    if (code.length !== 3) continue;
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

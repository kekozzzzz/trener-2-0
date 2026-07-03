// Точное эквити руки Hero против диапазона, отмеченного ИГРОКОМ на сетке 13×13
// (правило 1: все числа считает парсер честным перебором колоды, ИИ получает
// готовые проценты). Оба входа называет игрок — сам диапазон и его нарезку по
// улицам, — поэтому математика точная, а не «точная арифметика на угаданном входе».
// Здесь нет покерных допущений «что правильно»: только разворачивание кодов в
// конкретные комбо, вычет мёртвых карт (Hero + борд) и перебор ран-аутов.
//
// Только постфлоп: на префлопе честный перебор — ~10⁸ оценок (C(48,5) бордов на
// комбо), это неподъёмно без Монте-Карло, а приближения противоречат самой идее.
// Префлоп-вопросы закрываются процентом рук и сверками (VPIP, эталонные чарты).
// План: plans/2026-07-03-диапазонный-движок.md.

import { cardSetValue, compareValues } from "./made-hand";
import { combosOf } from "@/config/poker/hand-grid";
import { rankValue } from "@/config/poker/hand-codes";

const SUITS = ["c", "d", "h", "s"];

// Нормализация карты к виду "As"; null — карта не распознана (защитно, это данные
// из снимка, но движок не должен падать на кривом входе).
function norm(card: string): string | null {
  const r = card?.[0]?.toUpperCase();
  const s = card?.[1]?.toLowerCase();
  if (!r || !s || rankValue(r) < 0 || !SUITS.includes(s)) return null;
  return r + s;
}

function normAll(cards: string[]): string[] | null {
  const out: string[] = [];
  for (const c of cards) {
    const n = norm(c);
    if (!n) return null;
    out.push(n);
  }
  return out;
}

// Конкретные комбо кода 169-сетки: пара — 6, одномастные — 4, разномастные — 12.
export function combosForCode(code: string): [string, string][] {
  const out: [string, string][] = [];
  if (code.length === 2 && code[0] === code[1]) {
    const r = code[0];
    for (let i = 0; i < SUITS.length; i++)
      for (let j = i + 1; j < SUITS.length; j++) out.push([r + SUITS[i], r + SUITS[j]]);
    return out;
  }
  if (code.length !== 3) return out;
  const [hi, lo, kind] = [code[0], code[1], code[2]];
  if (kind === "s") {
    for (const s of SUITS) out.push([hi + s, lo + s]);
    return out;
  }
  if (kind !== "o") return out; // кривой суффикс — не угадываем
  for (const s1 of SUITS) for (const s2 of SUITS) if (s1 !== s2) out.push([hi + s1, lo + s2]);
  return out;
}

// Живые комбо диапазона: без комбо, задевающих мёртвые карты (Hero + борд).
function liveCombos(codes: Iterable<string>, dead: Set<string>): [string, string][] {
  const out: [string, string][] = [];
  for (const code of new Set(codes))
    for (const [a, b] of combosForCode(code)) if (!dead.has(a) && !dead.has(b)) out.push([a, b]);
  return out;
}

function fullDeck(): string[] {
  const deck: string[] = [];
  for (const r of "23456789TJQKA") for (const s of SUITS) deck.push(r + s);
  return deck;
}

export type RangeEquity = {
  equityPct: number; // эквити Hero в целых процентах: (победы + делёж/2) / всего
  combosLive: number; // комбо диапазона после вычета мёртвых карт
  combosMarked: number; // комбо по сетке, как отметил игрок (без вычета)
};

// Эквити Hero против набора кодов на борде из 3–5 карт. Ривер — прямое сравнение,
// тёрн — перебор 1 карты, флоп — перебор 2 карт. null — не постфлоп, кривые карты
// или в диапазоне не осталось живых комбо (это само по себе факт для тренера).
//
// Стоимость: худший случай (флоп, отмечена вся сетка) ≈ 1,2 млн сравнений — секунды
// в фоновом воркере, где рядом ждут LLM-вызов на ~10 с; кэпов не ставим, перебор
// остаётся честным.
export function equityVsRange(heroCards: string[], board: string[], codes: string[]): RangeEquity | null {
  const hero = normAll(heroCards);
  const brd = normAll(board);
  if (!hero || hero.length !== 2 || !brd || brd.length < 3 || brd.length > 5) return null;
  if (codes.length === 0) return null;

  const dead = new Set([...hero, ...brd]);
  if (dead.size !== hero.length + brd.length) return null; // дубль карт — кривой вход
  const combos = liveCombos(codes, dead);
  const combosMarked = combosOf(new Set(codes));
  if (combos.length === 0) return null;

  const unseen = fullDeck().filter((c) => !dead.has(c));
  const toCome = 5 - brd.length;
  let wins = 0;
  let ties = 0;
  let total = 0;

  // Значение руки Hero считается один раз на ран-аут, комбо соперника — по одному разу.
  const evalRunout = (runout: string[]) => {
    const heroVal = cardSetValue([...hero, ...brd, ...runout]);
    for (const [a, b] of combos) {
      if (runout.includes(a) || runout.includes(b)) continue; // комбо задето ран-аутом
      const d = compareValues(heroVal, cardSetValue([a, b, ...brd, ...runout]));
      total++;
      if (d > 0) wins++;
      else if (d === 0) ties++;
    }
  };

  if (toCome === 0) evalRunout([]);
  else if (toCome === 1) for (const c of unseen) evalRunout([c]);
  else
    for (let i = 0; i < unseen.length; i++)
      for (let j = i + 1; j < unseen.length; j++) evalRunout([unseen[i], unseen[j]]);

  if (total === 0) return null;
  return {
    equityPct: Math.round(((wins + ties / 2) / total) * 100),
    combosLive: combos.length,
    combosMarked,
  };
}

export type RangeCut = {
  foldPct: number; // процент живых комбо исходного диапазона, которые игрок «выбил»
  prevCombos: number; // живых комбо было
  keptCombos: number; // живых комбо осталось (пересечение с новым диапазоном)
  addedCombos: number; // комбо нового диапазона, которых НЕ было в исходном («доложил»)
};

// Нарезка диапазона между двумя ответами игрока («что открывает» → «что продолжает
// против ставки»). Мёртвые карты вычитаются по известным (борд может быть и пустым —
// префлоп-нарезка тоже осмысленна). null — кривой вход или исходный диапазон пуст.
export function cutBetween(
  prevCodes: string[],
  newCodes: string[],
  knownCards: string[]
): RangeCut | null {
  const known = normAll(knownCards);
  if (!known || prevCodes.length === 0) return null;

  const dead = new Set(known);
  const key = (c: [string, string]) => (c[0] < c[1] ? c[0] + c[1] : c[1] + c[0]);
  const prev = new Set(liveCombos(prevCodes, dead).map(key));
  const next = new Set(liveCombos(newCodes, dead).map(key));
  if (prev.size === 0) return null;

  let kept = 0;
  for (const k of next) if (prev.has(k)) kept++;
  const added = next.size - kept;

  return {
    foldPct: Math.round(((prev.size - kept) / prev.size) * 100),
    prevCombos: prev.size,
    keptCombos: kept,
    addedCombos: added,
  };
}

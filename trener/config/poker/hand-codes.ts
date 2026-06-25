// Канонические коды стартовых рук покера (169-сетка) — общая детерминированная
// арифметика рангов. Используется и RFI-чартом (config/poker/rfi-chart.ts), и
// детектором открытий (parser/open-raise.ts). Правило 1: классы рук считает код,
// не LLM. Здесь нет покерных диапазонов — только перевод «две карты → код руки».

// Порядок рангов по силе, индекс = достоинство (0 = двойка … 12 = туз).
export const RANK_CHARS = "23456789TJQKA";

export function rankValue(ch: string): number {
  return RANK_CHARS.indexOf(ch.toUpperCase());
}

type Hole = { highCh: string; lowCh: string; suited: boolean; pair: boolean };

// Разбор двух карт Hero ("Jc","Td") в старший/младший ранг + масть. null — если
// карт меньше двух или ранг/масть не распознаны (защитно).
function parseHole(cards: string[]): Hole | null {
  if (cards.length < 2) return null;
  const r1 = cards[0]?.[0];
  const r2 = cards[1]?.[0];
  const s1 = cards[0]?.[1];
  const s2 = cards[1]?.[1];
  if (!r1 || !r2 || !s1 || !s2) return null;
  const v1 = rankValue(r1);
  const v2 = rankValue(r2);
  if (v1 < 0 || v2 < 0) return null;
  const pair = v1 === v2;
  const [highCh, lowCh] = v1 >= v2 ? [r1.toUpperCase(), r2.toUpperCase()] : [r2.toUpperCase(), r1.toUpperCase()];
  return { highCh, lowCh, suited: s1.toLowerCase() === s2.toLowerCase(), pair };
}

// Код руки для сверки с чартом: пара "77", одномастные "AKs", разномастные "AKo".
// Старший ранг всегда первым. null — карты не распознаны.
export function handCode(cards: string[]): string | null {
  const h = parseHole(cards);
  if (!h) return null;
  if (h.pair) return h.highCh + h.highCh;
  return h.highCh + h.lowCh + (h.suited ? "s" : "o");
}

// Короткая подпись руки для показа игроку (только ранги, без масти): "JT", "77".
// На неё вешается ссылка в тексте обзора турнира.
export function handLabel(cards: string[]): string | null {
  const h = parseHole(cards);
  if (!h) return null;
  return h.pair ? h.highCh + h.highCh : h.highCh + h.lowCh;
}

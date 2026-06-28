import { handCategory } from "./made-hand";

// Дро Hero: ауты (чистые/грязные), бэкдоры и эквити — всё ТОЧНЫМ перебором колоды
// (правило 1: числа считает парсер). Грязные ауты вычитаем ДЕТЕРМИНИРОВАННО по борду,
// а не по угадыванию карт соперника: рук соперника мы не знаем, поэтому помечаем лишь
// объективно опасные доезды (спаренный борд → возможен фулл-хаус; стрит при 3+ одной
// масти → возможен флеш). Бэкдоры считаются сами собой через двухкарточный перебор.
//
// Источник правды для «какая рука собралась» — handCategory из made-hand.ts (один
// эвалюатор на весь парсер). Эквити здесь = вероятность ДОЕХАТЬ до стрита/флеша, а не
// выиграть против диапазона (солвер сознательно не ставим — facts.ts, раздел дро).

const RANKS: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const ALL_RANKS = "23456789TJQKA".split("");
const SUITS = ["c", "d", "h", "s"];

function fullDeck(): string[] {
  const deck: string[] = [];
  for (const r of ALL_RANKS) for (const s of SUITS) deck.push(r + s);
  return deck;
}

function unseenCards(seen: string[]): string[] {
  const used = new Set(seen.map((c) => c[0].toUpperCase() + c[1].toLowerCase()));
  return fullDeck().filter((c) => !used.has(c));
}

// Стрит или флеш у набора (категории 5 стрит, 6 флеш, 9 стрит-флеш).
function hasStraightOrFlush(cards: string[]): boolean {
  const c = handCategory(cards);
  return c === 5 || c === 6 || c === 9;
}

// Завершает ли набор `added` дро ИМЕННО Hero: рука со стритом/флешем есть с картами
// Hero, но нет у одного борда (иначе дро лежит на доске, не личное). straight=true,
// если лучшая рука Hero — стрит (для правила «стрит при возможном флеше = грязно»).
function completes(hero: string[], board: string[], added: string[]): { done: boolean; straight: boolean } {
  const withHero = [...hero, ...board, ...added];
  if (!hasStraightOrFlush(withHero)) return { done: false, straight: false };
  if (hasStraightOrFlush([...board, ...added])) return { done: false, straight: false };
  return { done: true, straight: handCategory(withHero) === 5 };
}

function boardPaired(board: string[]): boolean {
  const ranks = board.map((c) => c[0].toUpperCase());
  return new Set(ranks).size < ranks.length;
}

function threeOfASuit(board: string[]): boolean {
  const counts = new Map<string, number>();
  for (const c of board) {
    const s = c[1].toLowerCase();
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return Math.max(0, ...counts.values()) >= 3;
}

// Грязный доезд — по финальному борду, без карт соперника:
//   спаренный борд → возможен фулл-хаус/каре над стритом/флешем Hero; ИЛИ
//   Hero собрал стрит, а на борде 3+ одной масти → возможен флеш у соперника.
// Завершение флеша на неспаренном борде считаем чистым (выше/ниже флеша не моделируем).
function tainted(finalBoard: string[], heroStraight: boolean): boolean {
  if (boardPaired(finalBoard)) return true;
  if (heroStraight && threeOfASuit(finalBoard)) return true;
  return false;
}

export type DrawEquity = { cleanPct: number; rawPct: number };

// Эквити доехать за `cardsToCome` карт (1 или 2), сырое и чистое (исключая грязные
// финальные борды). null — если борд не флоп/тёрн или Hero уже собрал стрит/флеш.
export function drawEquity(hero: string[], board: string[], cardsToCome: 1 | 2): DrawEquity | null {
  if (hero.length < 2 || board.length < 3 || board.length > 4) return null;
  if (hasStraightOrFlush([...hero, ...board])) return null; // уже готовая рука, не дро

  const deck = unseenCards([...hero, ...board]);
  let total = 0;
  let raw = 0;
  let clean = 0;

  if (cardsToCome === 1) {
    for (const c of deck) {
      total++;
      const r = completes(hero, board, [c]);
      if (!r.done) continue;
      raw++;
      if (!tainted([...board, c], r.straight)) clean++;
    }
  } else {
    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) {
        total++;
        const r = completes(hero, board, [deck[i], deck[j]]);
        if (!r.done) continue;
        raw++;
        if (!tainted([...board, deck[i], deck[j]], r.straight)) clean++;
      }
    }
  }

  if (total === 0) return null;
  return { cleanPct: Math.round((clean / total) * 100), rawPct: Math.round((raw / total) * 100) };
}

export type DrawRead = {
  kind: string; // человеческое описание: «флеш-дро + ОЭСД», «бэкдорное флеш-дро»
  outsRaw: number; // одно-карточные ауты (0 у чисто бэкдорного дро)
  outsClean: number; // ауты минус грязные
  taintReason: string | null; // почему часть аутов грязная (для подачи)
  backdoorOnly: boolean; // дро есть только раннер-раннером
};

// Структурное имя дро (флеш-дро / ОЭСД / гатшот) — для ярлыка; числа берём из перебора.
function parseRank(card: string): number | null {
  return RANKS[card[0]?.toUpperCase()] ?? null;
}

// Есть ли 5 подряд среди рангов (туз и сверху, и снизу) — для подсчёта стрит-аутов
// независимо от того, не перебивает ли стрит флешем (иначе комбо-дро теряет ширину).
function hasStraightRanks(ranks: number[]): boolean {
  const set = new Set<number>(ranks);
  if (set.has(14)) set.add(1);
  for (let high = 14; high >= 5; high--) {
    let ok = true;
    for (let k = 0; k < 5; k++) if (!set.has(high - k)) { ok = false; break; }
    if (ok) return true;
  }
  return false;
}

function ranksOf(cards: string[]): number[] {
  return cards.map(parseRank).filter((r): r is number => r !== null);
}

// Сколько одно-карточных аутов достраивают стрит ИМЕННО Hero (для ярлыка ОЭСД/гатшот) —
// по рангам, включая карты, которые заодно дают флеш (их «ширину» учитываем тоже).
function straightOutsCount(hero: string[], board: string[]): number {
  const deck = unseenCards([...hero, ...board]);
  let outs = 0;
  for (const c of deck) {
    const withHero = hasStraightRanks(ranksOf([...hero, ...board, c]));
    const boardOnly = hasStraightRanks(ranksOf([...board, c]));
    if (withHero && !boardOnly) outs++;
  }
  return outs;
}

function flushDrawSuit(hero: string[], board: string[]): string | null {
  const seen = [...hero, ...board];
  for (const suit of SUITS) {
    const inSeen = seen.filter((c) => c[1].toLowerCase() === suit).length;
    const inHero = hero.filter((c) => c[1].toLowerCase() === suit).length;
    if (inSeen === 4 && inHero >= 1) return suit; // ровно 4 → дро (5 уже флеш)
  }
  return null;
}

function backdoorFlush(hero: string[], board: string[]): boolean {
  const seen = [...hero, ...board];
  for (const suit of SUITS) {
    const inSeen = seen.filter((c) => c[1].toLowerCase() === suit).length;
    const inHero = hero.filter((c) => c[1].toLowerCase() === suit).length;
    if (inSeen === 3 && inHero >= 1) return true;
  }
  return false;
}

// Полная сводка по дро Hero на флопе/тёрне. null — нет дро или это ривер/готовая рука.
export function readHeroDraw(hero: string[], board: string[]): DrawRead | null {
  if (hero.length < 2 || board.length < 3 || board.length > 4) return null;
  if (hasStraightOrFlush([...hero, ...board])) return null;

  const deck = unseenCards([...hero, ...board]);
  let outsRaw = 0;
  let outsClean = 0;
  let dirtyStraight = 0;
  let dirtyFlush = 0;
  for (const c of deck) {
    const r = completes(hero, board, [c]);
    if (!r.done) continue;
    outsRaw++;
    if (tainted([...board, c], r.straight)) {
      if (boardPaired([...board, c])) dirtyFlush++; // спаривание борда (фулл-риск)
      else dirtyStraight++; // стрит при возможном флеше
    } else outsClean++;
  }

  const flushSuit = flushDrawSuit(hero, board);
  const straightOuts = straightOutsCount(hero, board);

  if (outsRaw === 0) {
    // Одно-карточного дро нет — проверяем бэкдор (только флоп, 2 карты впереди).
    if (board.length === 3) {
      const eq = drawEquity(hero, board, 2);
      if (eq && eq.rawPct > 0) {
        return {
          kind: backdoorFlush(hero, board) ? "бэкдорное флеш-дро" : "бэкдорное стрит-дро",
          outsRaw: 0,
          outsClean: 0,
          taintReason: null,
          backdoorOnly: true,
        };
      }
    }
    return null;
  }

  const kinds: string[] = [];
  if (flushSuit) kinds.push("флеш-дро");
  if (straightOuts >= 8) kinds.push("двустороннее стрит-дро (ОЭСД)");
  else if (straightOuts > 0) kinds.push("гатшот");

  const reasons: string[] = [];
  if (dirtyFlush > 0) reasons.push(`${dirtyFlush} спаривают борд (возможен фулл-хаус)`);
  if (dirtyStraight > 0) reasons.push(`${dirtyStraight} достраивают возможный флеш`);

  return {
    kind: kinds.join(" + ") || "дро",
    outsRaw,
    outsClean,
    taintReason: reasons.length > 0 ? reasons.join(", ") : null,
    backdoorOnly: false,
  };
}

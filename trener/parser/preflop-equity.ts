// Точное префлоп-эквити руки Hero против ОТМЕЧЕННОГО игроком диапазона (олл-ин спот).
// Правило 1: числа считает парсер точным перебором всех бордов. Постфлоп это делает
// range-equity.ts (осталось 1-2 карты - быстро); префлоп борд = 5 карт (C(48,5) ≈ 1.7М
// на матчап), поэтому здесь СВОЙ быстрый оценщик руки (7 карт → упакованное число),
// иначе Map-оценщик made-hand.ts слишком медленный для миллионов бордов.
//
// Быстрый оценщик СВЕРЕН с made-hand.ts (единый проверенный источник) в тестах на
// случайных руках - порядок сравнения совпадает. «Точно и посильно» (решение №2 плана):
// эквити vs диапазон = среднее по живым комбо диапазона (мёртвые карты вычтены).

import { EQ_CODES, EQ_TABLE } from "@/config/poker/preflop-equity-table";
import { handCode } from "@/config/poker/hand-codes";

type Card = { r: number; s: number };

const RANK: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};
const SUIT: Record<string, number> = { c: 0, d: 1, h: 2, s: 3 };
const SUIT_CHARS = ["c", "d", "h", "s"];

function parse(card: string): Card | null {
  const r = RANK[card[0]?.toUpperCase()];
  const s = SUIT[card[1]?.toLowerCase()];
  if (r == null || s == null) return null;
  return { r, s };
}

// ── Быстрый 7-карточный оценщик: возвращает упакованное сравнимое число ─────────────
// Формат: категория(1-9) в старших битах + до 5 тай-брейков по 4 бита. Больше = сильнее.
// Порядок категорий и тай-брейков в точности как handValue из made-hand.ts.

const _rc = new Int8Array(15); // счётчики рангов 2..14 (скретч, не реентрантно)
const _sc = new Int8Array(4); // счётчики мастей

function pack(cat: number, tb: number[]): number {
  let v = cat;
  for (let i = 0; i < 5; i++) v = (v << 4) | (tb[i] ?? 0);
  return v;
}

// Высота лучшего стрита в битовой маске рангов (туз и сверху, и снизу). 0 — нет.
function straightHigh(mask: number): number {
  let m = mask;
  if (m & (1 << 14)) m |= 1 << 1; // колесо A-2-3-4-5
  for (let high = 14; high >= 5; high--) {
    let ok = true;
    for (let k = 0; k < 5; k++) if (!(m & (1 << (high - k)))) { ok = false; break; }
    if (ok) return high;
  }
  return 0;
}

// Топ-N рангов, присутствующих в _rc, исключая exclude (для кикеров/старших карт).
function collectTop(exclude: number[], n: number): number[] {
  const out: number[] = [];
  for (let r = 14; r >= 2 && out.length < n; r--) if (_rc[r] > 0 && !exclude.includes(r)) out.push(r);
  return out;
}

function top5Mask(mask: number): number[] {
  const out: number[] = [];
  for (let r = 14; r >= 2 && out.length < 5; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

export function fastEval7(cards: Card[]): number {
  _rc.fill(0);
  _sc.fill(0);
  let rankMask = 0;
  let sm0 = 0, sm1 = 0, sm2 = 0, sm3 = 0;
  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    _rc[c.r]++;
    _sc[c.s]++;
    rankMask |= 1 << c.r;
    if (c.s === 0) sm0 |= 1 << c.r;
    else if (c.s === 1) sm1 |= 1 << c.r;
    else if (c.s === 2) sm2 |= 1 << c.r;
    else sm3 |= 1 << c.r;
  }

  const flushMask = _sc[0] >= 5 ? sm0 : _sc[1] >= 5 ? sm1 : _sc[2] >= 5 ? sm2 : _sc[3] >= 5 ? sm3 : 0;
  if (flushMask) {
    const sf = straightHigh(flushMask);
    if (sf) return pack(9, [sf]); // стрит-флеш
  }

  let quad = 0, t1 = 0, t2 = 0, p1 = 0, p2 = 0;
  for (let r = 14; r >= 2; r--) {
    const n = _rc[r];
    if (n === 4) quad = r;
    else if (n === 3) { if (!t1) t1 = r; else if (!t2) t2 = r; }
    else if (n === 2) { if (!p1) p1 = r; else if (!p2) p2 = r; }
  }

  if (quad) return pack(8, [quad, collectTop([quad], 1)[0] ?? 0]); // каре
  if (t1 && (p1 || t2)) return pack(7, [t1, t2 || p1]); // фулл-хаус (трипс + пара/2-й трипс)
  if (flushMask) return pack(6, top5Mask(flushMask)); // флеш
  const st = straightHigh(rankMask);
  if (st) return pack(5, [st]); // стрит
  if (t1) return pack(4, [t1, ...collectTop([t1], 2)]); // сет/трипс
  if (p1 && p2) return pack(3, [p1, p2, collectTop([p1, p2], 1)[0] ?? 0]); // две пары
  if (p1) return pack(2, [p1, ...collectTop([p1], 3)]); // пара
  return pack(1, collectTop([], 5)); // старшая карта
}

// Все 52 карты как {r,s} — один раз.
const DECK: Card[] = [];
for (const rch of "23456789TJQKA") for (const sch of SUIT_CHARS) DECK.push({ r: RANK[rch], s: SUIT[sch] });

// Комбо стартовой руки по коду ("AA" | "AKs" | "AKo") в виде пар строк карт.
function codeToCombos(code: string): string[][] {
  const r1 = code[0], r2 = code[1];
  const out: string[][] = [];
  if (code.length === 2) {
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) out.push([r1 + SUIT_CHARS[i], r1 + SUIT_CHARS[j]]);
  } else if (code[2] === "s") {
    for (const s of SUIT_CHARS) out.push([r1 + s, r2 + s]);
  } else {
    for (const s1 of SUIT_CHARS) for (const s2 of SUIT_CHARS) if (s1 !== s2) out.push([r1 + s1, r2 + s2]);
  }
  return out;
}

const cardId = (c: Card) => c.r * 4 + c.s;

export type PreflopEquity = { equityPct: number; combosLive: number };

// Точное эквити руки Hero против диапазона codes (коды сетки) ПРЕФЛОП, перебором всех
// бордов. null — кривой вход (не 2 карты Hero, пустой/битый диапазон, дубли карт).
export function preflopEquityVsRange(heroCards: string[], codes: string[]): PreflopEquity | null {
  const hero = heroCards.map(parse).filter((c): c is Card => c !== null);
  if (hero.length !== 2 || codes.length === 0) return null;
  const heroIds = new Set(hero.map(cardId));
  if (heroIds.size !== 2) return null;

  // Живые комбо диапазона: обе карты не совпадают с картами Hero.
  const seen = new Set<string>();
  const combos: Card[][] = [];
  for (const code of codes) {
    for (const [a, b] of codeToCombos(code)) {
      const ca = parse(a), cb = parse(b);
      if (!ca || !cb) continue;
      if (heroIds.has(cardId(ca)) || heroIds.has(cardId(cb))) continue;
      const key = [cardId(ca), cardId(cb)].sort((x, y) => x - y).join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      combos.push([ca, cb]);
    }
  }
  if (combos.length === 0) return null;

  const heroBuf: Card[] = [hero[0], hero[1], hero[0], hero[0], hero[0], hero[0], hero[0]];
  const villBuf: Card[] = [hero[0], hero[1], hero[0], hero[0], hero[0], hero[0], hero[0]];

  // Скорость: перебираем борды ОДИН раз по колоде без карт Hero (50 карт), руку Hero
  // оцениваем ОДИН раз на борд, а все комбо соперника гоняем внутри (Hero-оценка
  // амортизируется). Задел борда по карте соперника — мгновенно по флагу inBoard.
  const deck = DECK.filter((c) => !heroIds.has(cardId(c)));
  const n = deck.length; // 50
  const items = combos.map(([c0, c1]) => ({
    c0, c1, id0: cardId(c0), id1: cardId(c1), wins: 0, ties: 0, total: 0,
  }));
  const inBoard = new Uint8Array(60);

  for (let a = 0; a < n; a++) {
    const ca = deck[a]; heroBuf[2] = ca; villBuf[2] = ca; inBoard[cardId(ca)] = 1;
    for (let b = a + 1; b < n; b++) {
      const cb = deck[b]; heroBuf[3] = cb; villBuf[3] = cb; inBoard[cardId(cb)] = 1;
      for (let c = b + 1; c < n; c++) {
        const cc = deck[c]; heroBuf[4] = cc; villBuf[4] = cc; inBoard[cardId(cc)] = 1;
        for (let d = c + 1; d < n; d++) {
          const cd = deck[d]; heroBuf[5] = cd; villBuf[5] = cd; inBoard[cardId(cd)] = 1;
          for (let e = d + 1; e < n; e++) {
            const ce = deck[e]; heroBuf[6] = ce; villBuf[6] = ce; inBoard[cardId(ce)] = 1;
            const heroScore = fastEval7(heroBuf);
            for (let k = 0; k < items.length; k++) {
              const it = items[k];
              if (inBoard[it.id0] || inBoard[it.id1]) continue; // борд задел карту соперника
              villBuf[0] = it.c0; villBuf[1] = it.c1;
              const vs = fastEval7(villBuf);
              it.total++;
              if (heroScore > vs) it.wins++;
              else if (heroScore === vs) it.ties++;
            }
            inBoard[cardId(ce)] = 0;
          }
          inBoard[cardId(cd)] = 0;
        }
        inBoard[cardId(cc)] = 0;
      }
      inBoard[cardId(cb)] = 0;
    }
    inBoard[cardId(ca)] = 0;
  }

  let sumEquity = 0;
  for (const it of items) sumEquity += it.total > 0 ? (it.wins + it.ties / 2) / it.total : 0;
  return { equityPct: Math.round((sumEquity / items.length) * 100), combosLive: items.length };
}

// ── МГНОВЕННЫЙ префлоп-эквити по предпосчитанной таблице ────────────────────────────
// Скорость - главный приоритет (feedback_speed_priority): вместо живого перебора (22с на
// большом диапазоне) - лукап в таблице EQ_TABLE (класс vs класс) + усреднение по диапазону
// с весом = число живых комбо каждого класса (card removal). Мгновенно, ±~0.18% от точного
// (таблица запечена Monte Carlo). Точный preflopEquityVsRange остаётся эталоном/фолбэком.

const EQ_INDEX = new Map(EQ_CODES.map((c, i) => [c, i]));

// Живых комбо класса code после вычета карт Hero.
function liveComboCount(code: string, deadIds: Set<number>): number {
  let n = 0;
  for (const [a, b] of codeToCombos(code)) {
    const ca = parse(a), cb = parse(b);
    if (!ca || !cb) continue;
    if (deadIds.has(cardId(ca)) || deadIds.has(cardId(cb))) continue;
    n++;
  }
  return n;
}

export function preflopEquityVsRangeFast(heroCards: string[], codes: string[]): PreflopEquity | null {
  const hero = heroCards.map(parse).filter((c): c is Card => c !== null);
  if (hero.length !== 2 || codes.length === 0) return null;
  const deadIds = new Set(hero.map(cardId));
  if (deadIds.size !== 2) return null;
  const heroCode = handCode(heroCards);
  const hi = heroCode ? EQ_INDEX.get(heroCode) : undefined;
  if (hi == null) return null;

  let wsum = 0, csum = 0;
  for (const code of codes) {
    const ci = EQ_INDEX.get(code);
    if (ci == null) continue;
    const live = liveComboCount(code, deadIds);
    if (live === 0) continue;
    wsum += (EQ_TABLE[hi][ci] / 10) * live;
    csum += live;
  }
  if (csum === 0) return null;
  return { equityPct: Math.round(wsum / csum), combosLive: csum };
}

import type { Street, TableAction, TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";

// Дешёвые детерминированные факты раздачи — общая покерная арифметика, которую
// парсер считает за LLM (правило 1: тренер числа не вычисляет). Всё выводится из
// уже сохранённого снимка стола, поэтому считается на этапе рендера промпта и не
// требует ни новых полей в БД, ни миграции.
//
// Это ВНУТРЕННИЙ вход для модели: здесь точные термины (SPR, пот-оддс) уместны —
// игроку модель переводит их простыми словами (см. COACH_FRAMEWORK, раздел «Язык»).
//
// Сознательно НЕ считаем здесь: эквити от аутов (нужен анализ дро по картам Hero),
// членство в префлоп-чарте и пуш-фолд Nash-диапазоне (нужен источник чартов +
// полная позиция). Неверное число в этих местах = катастрофа правила 2, поэтому
// они ждут отдельной выверки источников.

const RANKS: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

type Card = { rank: number; suit: string };

function parseCard(card: string): Card | null {
  const rank = RANKS[card[0]?.toUpperCase()];
  const suit = card[1]?.toLowerCase();
  if (rank == null || !suit) return null;
  return { rank, suit };
}

export type BoardTexture = {
  cards: number;
  // масти: одна (монотон, флеш готов), две (возможно флеш-дро), радуга
  suitedness: "MONOTONE" | "TWO_TONE" | "RAINBOW";
  paired: boolean;
  // связность: насколько борд даёт стриты — для коротких бордов грубая оценка
  connected: "CONNECTED" | "SEMI" | "DISCONNECTED";
};

// Текстура только когда есть флоп (3+ карты). До флопа борда нет.
export function boardTexture(board: string[]): BoardTexture | null {
  const cards = board.map(parseCard).filter((c): c is Card => c !== null);
  if (cards.length < 3) return null;

  const suitCounts = new Map<string, number>();
  for (const c of cards) suitCounts.set(c.suit, (suitCounts.get(c.suit) ?? 0) + 1);
  const maxSuit = Math.max(...suitCounts.values());
  const suitedness: BoardTexture["suitedness"] =
    maxSuit >= 3 ? "MONOTONE" : maxSuit === 2 ? "TWO_TONE" : "RAINBOW";

  const ranks = cards.map((c) => c.rank);
  const paired = new Set(ranks).size < ranks.length;

  // Связность: минимальный размах любой тройки соседних по достоинству карт.
  // Туз учитываем и как 14, и как 1 (колёса). Спан тройки ≤4 — связно, ≤6 — полусвязно.
  const uniq = [...new Set(ranks.flatMap((r) => (r === 14 ? [14, 1] : [r])))].sort((a, b) => a - b);
  let bestSpan = Infinity;
  for (let i = 0; i + 2 < uniq.length; i++) bestSpan = Math.min(bestSpan, uniq[i + 2] - uniq[i]);
  const connected: BoardTexture["connected"] =
    bestSpan <= 4 ? "CONNECTED" : bestSpan <= 6 ? "SEMI" : "DISCONNECTED";

  return { cards: cards.length, suitedness, paired, connected };
}

// ─────────────────────── Дро и эквити от аутов ──────────────────────────────
// Привязываем дро именно к картам Hero (не к доске вообще). Ауты считаем точным
// перебором колоды; эквити — по правилу 2/4 (≈ ауты × 2 за улицу). Это
// приблизительная оценка (грязные ауты не вычитаются) — помечаем «≈». На ривере
// дро нет. Никаких чартов по памяти: только общая арифметика и логика.

const SUITS = ["c", "d", "h", "s"];

// Ранги, добавление которых достраивает стрит (туз учитываем как 14 и как 1).
function straightCompletingRanks(ranks: number[]): Set<number> {
  const present = new Set<number>(ranks);
  if (present.has(14)) present.add(1);
  const completing = new Set<number>();
  for (let r = 2; r <= 14; r++) {
    const withR = new Set(present);
    withR.add(r);
    if (r === 14) withR.add(1);
    for (let start = 1; start <= 10; start++) {
      let all = true;
      for (let k = 0; k < 5; k++) if (!withR.has(start + k)) { all = false; break; }
      if (all) { completing.add(r); break; }
    }
  }
  return completing;
}

function hasMadeStraight(ranks: number[]): boolean {
  const present = new Set<number>(ranks);
  if (present.has(14)) present.add(1);
  for (let start = 1; start <= 10; start++) {
    let all = true;
    for (let k = 0; k < 5; k++) if (!present.has(start + k)) { all = false; break; }
    if (all) return true;
  }
  return false;
}

export type DrawInfo = { kind: string; outs: number; equityPct: number };

// Дро Hero на флопе/тёрне (3–4 карты борда). null — если дро нет или это ривер.
export function heroDraw(heroCards: string[], board: string[]): DrawInfo | null {
  const hero = heroCards.map(parseCard).filter((c): c is Card => c !== null);
  const boardC = board.map(parseCard).filter((c): c is Card => c !== null);
  if (hero.length < 2 || boardC.length < 3 || boardC.length > 4) return null;

  const seen = [...hero, ...boardC];
  const seenKey = new Set(seen.map((c) => `${c.rank}${c.suit}`));
  const suitCount = (cards: Card[], suit: string) => cards.filter((c) => c.suit === suit).length;

  // Флеш-дро Hero: масть, где у Hero+борда ровно 4 карты и хотя бы одна — у Hero.
  let flushSuit: string | null = null;
  for (const suit of SUITS) {
    if (suitCount(seen, suit) >= 5) return null; // флеш уже собран — это не дро
    if (suitCount(seen, suit) === 4 && suitCount(hero, suit) >= 1) flushSuit = suit;
  }

  if (hasMadeStraight(seen.map((c) => c.rank))) return null; // стрит уже собран

  // Стрит-дро Hero: карты Hero должны РАСШИРЯТЬ набор достраивающих рангов
  // (иначе дро целиком на доске, не личное у Hero).
  const completeWithHero = straightCompletingRanks(seen.map((c) => c.rank));
  const completeBoardOnly = straightCompletingRanks(boardC.map((c) => c.rank));
  const straightActive = completeWithHero.size > completeBoardOnly.size;
  const completingRanks = straightActive ? completeWithHero : new Set<number>();

  if (!flushSuit && completingRanks.size === 0) return null;

  // Ауты — точным перебором оставшейся колоды (учёт пересечения флеша и стрита).
  let outs = 0;
  let straightOuts = 0;
  for (let r = 2; r <= 14; r++) {
    for (const suit of SUITS) {
      if (seenKey.has(`${r}${suit}`)) continue;
      const completesFlush = flushSuit !== null && suit === flushSuit;
      const completesStraight = completingRanks.has(r);
      if (completesFlush || completesStraight) outs++;
      if (completesStraight) straightOuts++;
    }
  }

  const streetsToCome = boardC.length === 3 ? 2 : 1;
  const equityRaw = streetsToCome === 2 ? outs * 4 : outs * 2;
  const equityPct = Math.min(equityRaw, 95);

  const kinds: string[] = [];
  if (flushSuit) kinds.push("флеш-дро");
  if (straightOuts >= 8) kinds.push("двустороннее стрит-дро (ОЭСД)");
  else if (straightOuts > 0) kinds.push("гатшот");

  return { kind: kinds.join(" + "), outs, equityPct };
}

const SUITEDNESS_RU: Record<BoardTexture["suitedness"], string> = {
  MONOTONE: "три и более одной масти",
  TWO_TONE: "две одной масти",
  RAINBOW: "разномастный",
};

const CONNECTED_RU: Record<BoardTexture["connected"], string> = {
  CONNECTED: "связанный (много стрит-дро)",
  SEMI: "умеренно связанный",
  DISCONNECTED: "несвязанный (сухой)",
};

// Класс размера ставки относительно банка — детерминированный рид «крупно/стандартно».
// Стандарт по фреймворку — 1/3…3/4 банка; на стандарт тренер отдельно не реагирует,
// крупная/овербет читается как сила или поляризация.
export type BetSizeClass = "SMALL" | "STANDARD" | "LARGE" | "OVERBET";

function sizeClass(pctOfPot: number): BetSizeClass {
  if (pctOfPot < 33) return "SMALL"; // блок/проб-бет
  if (pctOfPot <= 80) return "STANDARD"; // 1/3, 1/2, 3/4 — не реагируем
  if (pctOfPot <= 110) return "LARGE"; // больше стандарта = сила
  return "OVERBET"; // ставка больше банка — поляризация
}

const SIZE_CLASS_RU: Record<BetSizeClass, string> = {
  SMALL: "мелкая",
  STANDARD: "стандарт",
  LARGE: "крупная",
  OVERBET: "овербет",
};

// Борд на момент улицы: флоп — первые 3 карты, тёрн — 4, ривер — 5.
// Нужен, чтобы считать дро/имплайды на улице действия, а не по финальному борду.
function boardUpToStreet(board: string[], street: Street): string[] {
  if (street === "FLOP") return board.slice(0, 3);
  if (street === "TURN") return board.slice(0, 4);
  if (street === "RIVER") return board.slice(0, 5);
  return [];
}

// Одна заметная ставка/рейз для тренера: чей размер и доля банка до действия.
export type BetFact = {
  street: Street;
  actor: string;
  // доля банка ДО этого действия, %: для бета — betSize/pot; для рейза — добавленные фишки/pot
  sizePctOfPot: number;
  sizeClass: BetSizeClass;
};

// Спот, где Hero стоит перед ставкой соперника и должен решать колл/фолд.
export type HeroFacingBet = {
  street: Street;
  // сколько Hero доложить, чтобы заколлировать
  toCall: number;
  // сколько эквити нужно для прибыльного колла, % = toCall / (банк_после_ставки + toCall)
  equityToCallPct: number;
  // если у Hero есть дро на этой улице — его эквити до следующей улицы, %
  drawEquityPct?: number;
  // обратные оддсы: если прямых пот-оддсов с дро не хватает, сколько фишек нужно
  // дополнительно выиграть на будущих улицах при попадании, чтобы колл окупился
  impliedExtraNeeded?: number;
};

// Спот, где Hero сам ставит/рейзит как агрессор.
export type HeroBet = {
  street: Street;
  sizePctOfPot: number;
  sizeClass: BetSizeClass;
  // как часто соперник должен сбрасывать, чтобы блеф окупился сразу, % = риск/(банк_до+риск)
  foldsNeededPct: number;
  // банк, если соперник коллирует — «сколько соберёшь, если доедешь» при полу-блефе
  potIfCalled: number;
  // если у Hero есть дро на этой улице — эквити до следующей улицы, % (бет = полу-блеф)
  drawEquityPct?: number;
};

export type HandFacts = {
  heroStackBb: number | null;
  effectiveStackBb: number | null;
  sprFlop: number | null;
  texture: BoardTexture | null;
  draw: DrawInfo | null;
  bets: BetFact[];
  heroFacing: HeroFacingBet[];
  heroBets: HeroBet[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number) => Math.round(n * 100);

// Прогон банка по действиям. amount у RAISE — абсолютная сумма «to» на улице,
// у BET/CALL/POST — добавляемая дельта (см. parseActions). ALL_IN однозначим по
// порогу: сумма больше текущей ставки на улице → это рейз «to amount», иначе колл-дельта.
// Факт бета/рейза Hero: размер, фолд-эквити, банк при колле и (если есть дро) полу-блеф.
// risk — добавляемые фишки (для бета весь amt, для рейза дельта); potBefore — банк ДО действия.
function heroBetFact(snapshot: TableSnapshot, street: Street, risk: number, potBefore: number): HeroBet {
  const size = pct(risk / potBefore);
  const fact: HeroBet = {
    street,
    sizePctOfPot: size,
    sizeClass: sizeClass(size),
    foldsNeededPct: pct(risk / (potBefore + risk)),
    // если соперник коллирует: он доложит столько же → банк потолстеет на 2×risk
    potIfCalled: potBefore + 2 * risk,
  };
  const draw = heroDraw(snapshot.heroCards, boardUpToStreet(snapshot.board, street));
  if (draw) fact.drawEquityPct = draw.equityPct;
  return fact;
}

function walkPot(snapshot: TableSnapshot, bigBlind: number | null): HandFacts {
  const startingStack = new Map<string, number>();
  for (const s of snapshot.seats) startingStack.set(s.label, s.startingStack);

  let pot = 0;
  let currentBet = 0;
  let street: Street = "PREFLOP";
  const streetCommitted = new Map<string, number>();
  const invested = new Map<string, number>(); // суммарно вложено за раздачу
  const folded = new Set<string>();

  const bets: BetFact[] = [];
  const heroFacing: HeroFacingBet[] = [];
  const heroBets: HeroBet[] = [];

  let potAtFlop: number | null = null;
  let investedAtFlop: Map<string, number> | null = null;
  let foldedAtFlop: Set<string> | null = null;

  const addInvested = (actor: string, delta: number) =>
    invested.set(actor, (invested.get(actor) ?? 0) + delta);

  for (const a of snapshot.actions) {
    if (a.street !== street) {
      // начало новой улицы: фиксируем банк до её действий, обнуляем ставку улицы
      if (a.street === "FLOP" && potAtFlop === null) {
        potAtFlop = pot;
        investedAtFlop = new Map(invested);
        foldedAtFlop = new Set(folded);
      }
      street = a.street;
      streetCommitted.clear();
      currentBet = 0;
    }

    const committed = streetCommitted.get(a.actor) ?? 0;

    switch (a.action) {
      case "POST_ANTE":
        pot += a.amount ?? 0;
        addInvested(a.actor, a.amount ?? 0);
        break;
      case "POST_SB":
      case "POST_BB": {
        const amt = a.amount ?? 0;
        streetCommitted.set(a.actor, committed + amt);
        pot += amt;
        addInvested(a.actor, amt);
        currentBet = Math.max(currentBet, committed + amt);
        break;
      }
      case "FOLD":
        folded.add(a.actor);
        break;
      case "CHECK":
        break;
      case "CALL": {
        const amt = a.amount ?? 0;
        streetCommitted.set(a.actor, committed + amt);
        pot += amt;
        addInvested(a.actor, amt);
        break;
      }
      case "BET": {
        const amt = a.amount ?? 0;
        // Доля банка как рид — постфлоп-понятие; префлоп меряют в BB, не в %банка.
        if (street !== "PREFLOP" && a.actor === "Hero" && pot > 0) {
          heroBets.push(heroBetFact(snapshot, street, amt, pot));
        } else if (street !== "PREFLOP" && pot > 0) {
          const size = pct(amt / pot);
          bets.push({ street, actor: a.actor, sizePctOfPot: size, sizeClass: sizeClass(size) });
        }
        streetCommitted.set(a.actor, committed + amt);
        pot += amt;
        addInvested(a.actor, amt);
        currentBet = committed + amt;
        break;
      }
      case "RAISE":
      case "ALL_IN": {
        const raw = a.amount ?? 0;
        const isRaise = a.action === "RAISE" || raw > currentBet;
        if (isRaise) {
          const delta = Math.max(raw - committed, 0);
          if (street !== "PREFLOP" && a.actor === "Hero" && pot > 0) {
            heroBets.push(heroBetFact(snapshot, street, delta, pot));
          } else if (street !== "PREFLOP" && pot > 0) {
            const size = pct(delta / pot);
            bets.push({ street, actor: a.actor, sizePctOfPot: size, sizeClass: sizeClass(size) });
          }
          pot += delta;
          addInvested(a.actor, delta);
          streetCommitted.set(a.actor, raw);
          currentBet = raw;
        } else {
          // олл-ин как колл-дельта
          streetCommitted.set(a.actor, committed + raw);
          pot += raw;
          addInvested(a.actor, raw);
        }
        break;
      }
    }

    // Спот решения Hero: после действия соперника Hero нужно доложить currentBet−его вклад.
    if (a.actor !== "Hero" && !folded.has("Hero")) {
      const heroCommitted = streetCommitted.get("Hero") ?? 0;
      const toCall = currentBet - heroCommitted;
      if (toCall > 0) {
        // банк на этот момент уже включает ставку соперника
        const last = heroFacing[heroFacing.length - 1];
        const fact: HeroFacingBet = {
          street,
          toCall,
          equityToCallPct: pct(toCall / (pot + toCall)),
        };
        // Обратные оддсы с дро: если прямой эквити не хватает, считаем добор при попадании.
        const draw = heroDraw(snapshot.heroCards, boardUpToStreet(snapshot.board, street));
        if (draw) {
          fact.drawEquityPct = draw.equityPct;
          const p = draw.equityPct / 100;
          // нужное p ≥ toCall/(pot + toCall + X) → X = toCall/p − pot − toCall
          const extra = p > 0 ? toCall / p - pot - toCall : 0;
          if (extra > 0) fact.impliedExtraNeeded = Math.round(extra);
        }
        // один спот на улицу — оставляем последний (самый крупный to-call)
        if (last && last.street === street) heroFacing[heroFacing.length - 1] = fact;
        else heroFacing.push(fact);
      }
    }
  }

  const heroStack = startingStack.get("Hero") ?? null;
  const heroStackBb = heroStack !== null && bigBlind ? round1(heroStack / bigBlind) : null;

  // Эффективный стек = меньший из Hero и наибольшего соперника (с кем реально играем).
  const opponentStacks = snapshot.seats.filter((s) => s.label !== "Hero").map((s) => s.startingStack);
  const effectiveChips =
    heroStack !== null && opponentStacks.length > 0 ? Math.min(heroStack, Math.max(...opponentStacks)) : null;
  const effectiveStackBb = effectiveChips !== null && bigBlind ? round1(effectiveChips / bigBlind) : null;

  // SPR на флопе: эффективный остаток после префлопа / банк на начало флопа.
  let sprFlop: number | null = null;
  if (potAtFlop !== null && potAtFlop > 0 && investedAtFlop && foldedAtFlop && heroStack !== null) {
    const remaining = (label: string) => (startingStack.get(label) ?? 0) - (investedAtFlop!.get(label) ?? 0);
    const active = snapshot.seats.map((s) => s.label).filter((l) => !foldedAtFlop!.has(l));
    const heroRemaining = remaining("Hero");
    const oppRemaining = active.filter((l) => l !== "Hero").map(remaining);
    if (oppRemaining.length > 0) {
      const effRemaining = Math.min(heroRemaining, Math.max(...oppRemaining));
      sprFlop = round1(effRemaining / potAtFlop);
    }
  }

  return {
    heroStackBb,
    effectiveStackBb,
    sprFlop,
    texture: boardTexture(snapshot.board),
    draw: heroDraw(snapshot.heroCards, snapshot.board),
    bets,
    heroFacing,
    heroBets,
  };
}

export function computeHandFacts(snapshot: TableSnapshot): HandFacts {
  return walkPot(snapshot, bigBlindFromSnapshot(snapshot));
}

// Текстовый блок фактов для промпта. Пусто, если считать нечего (например, фолд
// до флопа без заметных ставок) — тогда тренер просто работает по снимку.
export function renderHandFacts(snapshot: TableSnapshot): string {
  const f = computeHandFacts(snapshot);
  const lines: string[] = [];

  if (f.heroStackBb !== null) lines.push(`Стек Hero на старте раздачи: ${f.heroStackBb} BB.`);
  if (f.effectiveStackBb !== null && f.effectiveStackBb !== f.heroStackBb)
    lines.push(`Эффективный стек (против крупнейшего соперника): ${f.effectiveStackBb} BB.`);

  if (f.texture) {
    const t = f.texture;
    const parts = [SUITEDNESS_RU[t.suitedness], CONNECTED_RU[t.connected]];
    if (t.paired) parts.push("спаренный");
    lines.push(`Текстура борда: ${parts.join(", ")}.`);
  }

  if (f.sprFlop !== null) lines.push(`SPR на флопе: ${f.sprFlop} (эффективный остаток к банку флопа).`);

  if (f.draw)
    lines.push(
      `Дро Hero: ${f.draw.kind} — ${f.draw.outs} аутов, эквити до ривера ≈${f.draw.equityPct}% (грубо, по правилу 2/4).`,
    );

  for (const b of f.bets)
    lines.push(
      `Ставка соперника (${b.actor}, ${b.street}): ≈${b.sizePctOfPot}% банка (${SIZE_CLASS_RU[b.sizeClass]}).`,
    );
  for (const b of f.heroBets) {
    let line = `Ставка Hero (${b.street}): ≈${b.sizePctOfPot}% банка (${SIZE_CLASS_RU[b.sizeClass]}); как блеф окупается, если соперник сбрасывает чаще ≈${b.foldsNeededPct}%.`;
    if (b.drawEquityPct !== undefined)
      line += ` У Hero дро (эквити ≈${b.drawEquityPct}%) — это полу-блеф: при колле банк станет ${b.potIfCalled} (потенциал добора, если доедешь).`;
    lines.push(line);
  }
  for (const h of f.heroFacing) {
    let line = `Решение Hero на ${h.street}: доложить ${h.toCall} для колла; прибыльно при эквити от ≈${h.equityToCallPct}% (пот-оддс).`;
    if (h.drawEquityPct !== undefined) {
      if (h.impliedExtraNeeded !== undefined)
        line += ` У Hero дро (эквити ≈${h.drawEquityPct}%) — прямых пот-оддсов не хватает: колл окупится, только если при попадании доберёшь ещё ≥${h.impliedExtraNeeded} на следующих улицах (обратные оддсы).`;
      else line += ` У Hero дро (эквити ≈${h.drawEquityPct}%) — прямых пот-оддсов уже достаточно для колла.`;
    }
    lines.push(line);
  }

  if (lines.length === 0) return "";
  return ["Числа от парсера (используй как есть; игроку объясняй простыми словами, без терминов):", ...lines].join("\n");
}

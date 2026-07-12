import type { Street, TableAction, TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { boardUpToStreet } from "./table-state";
import { heroMadeHand } from "./made-hand";
import { readHeroDraw, drawEquity, improvementOuts, type DrawRead } from "./draws";
import { handCode } from "@/config/poker/hand-codes";
import { preflopChartFact } from "./preflop-chart-fact";
import { renderChartEquityFacts } from "./chart-equity-fact";
import { renderAllInGeometry } from "./allin-geometry";

// Дешёвые детерминированные факты раздачи — общая покерная арифметика, которую
// парсер считает за LLM (правило 1: тренер числа не вычисляет). Всё выводится из
// уже сохранённого снимка стола, поэтому считается на этапе рендера промпта и не
// требует ни новых полей в БД, ни миграции.
//
// Это ВНУТРЕННИЙ вход для модели: здесь точные термины (SPR, пот-оддс) уместны —
// игроку модель переводит их простыми словами (см. COACH_FRAMEWORK, раздел «Язык»).
//
// Эквити от аутов считает ./draws, вердикт префлоп-чартов (RFI, защита BB, против
// опена, изоляция, пуш-фолд) — ./preflop-chart-fact теми же грейдерами, что /charts.

const RANKS: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

// Имена рангов для маркеров опасности борда (родительный мн. и единственное).
const GEN_PL_RU: Record<number, string> = {
  14: "тузов", 13: "королей", 12: "дам", 11: "валетов", 10: "десяток", 9: "девяток",
  8: "восьмёрок", 7: "семёрок", 6: "шестёрок", 5: "пятёрок", 4: "четвёрок", 3: "троек", 2: "двоек",
};
const SG_RU: Record<number, string> = {
  14: "тузом", 13: "королём", 12: "дамой", 11: "валетом", 10: "десяткой", 9: "девяткой",
  8: "восьмёркой", 7: "семёркой", 6: "шестёркой", 5: "пятёркой", 4: "четвёркой", 3: "тройкой", 2: "двойкой",
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

// Дро и эквити от аутов (чистые/грязные ауты, бэкдоры, точный перебор) живут в
// ./draws (readHeroDraw, drawEquity) — единый эвалюатор рук с made-hand.ts.

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

export function sizeClass(pctOfPot: number): BetSizeClass {
  if (pctOfPot < 33) return "SMALL"; // блок/проб-бет
  if (pctOfPot <= 80) return "STANDARD"; // 1/3, 1/2, 3/4 — не реагируем
  if (pctOfPot <= 110) return "LARGE"; // больше стандарта = сила
  return "OVERBET"; // ставка больше банка — поляризация
}

export const SIZE_CLASS_RU: Record<BetSizeClass, string> = {
  SMALL: "мелкая",
  STANDARD: "стандарт",
  LARGE: "крупная",
  OVERBET: "овербет",
};

// Борд на момент улицы (boardUpToStreet) живёт в ./table-state — единый источник
// для расчёта дро/имплайдов здесь и для визуальной схемы стола в разборе.

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
  draw: DrawRead | null;
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
  // Бет Hero с дро = полу-блеф: показываем силу дро к риверу (2 карты на флопе, 1 на
  // тёрне) — это потенциал добора, если соперник коллирует. Берём чистое эквити.
  const b = boardUpToStreet(snapshot.board, street);
  const eq = drawEquity(snapshot.heroCards, b, b.length === 3 ? 2 : 1);
  if (eq && eq.rawPct > 0) fact.drawEquityPct = eq.cleanPct > 0 ? eq.cleanPct : eq.rawPct;
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
        // Обратные оддсы с дро: если прямого эквити не хватает, считаем добор при
        // попадании. Горизонт по цене именно ЭТОГО колла: против обычной ставки на
        // флопе видно одну карту (тёрн), против олл-ина — обе. Берём чистое эквити.
        const b = boardUpToStreet(snapshot.board, street);
        const facingAllIn = a.action === "ALL_IN";
        const cardsToCome = b.length === 3 && facingAllIn ? 2 : 1;
        const eq = drawEquity(snapshot.heroCards, b, cardsToCome);
        if (eq && eq.rawPct > 0) {
          const equity = eq.cleanPct > 0 ? eq.cleanPct : eq.rawPct;
          fact.drawEquityPct = equity;
          const p = equity / 100;
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
    draw: readHeroDraw(snapshot.heroCards, snapshot.board),
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
const STREET_RU: Record<Street, string> = {
  PREFLOP: "префлопе",
  FLOP: "флопе",
  TURN: "тёрне",
  RIVER: "ривере",
};

// Факты-v2 фаза 4: маркеры опасности борда для ГОТОВОЙ руки — считает парсер (правило 1),
// чтобы модель не «прикидывала на глаз», что на спаренном/тройном борде фулл-хаус уже в
// игре, и не звала слабую готовую руку натсами. Спаренный борд → фулл-хаус возможен; борд
// с трипсом → любая пара соперника уже фулл; свой фулл может быть НЕ старшим. Только борд
// (3+ карты) — решение принимают до вскрытия, поэтому факт безопасен и для разбора.
export function boardDangerFacts(heroCards: string[], board: string[]): string[] {
  const b = board.map(parseCard).filter((c): c is Card => c !== null);
  if (b.length < 3) return [];
  const out: string[] = [];

  const boardCount = new Map<number, number>();
  for (const c of b) boardCount.set(c.rank, (boardCount.get(c.rank) ?? 0) + 1);
  const tripRank = [...boardCount.entries()].filter(([, n]) => n >= 3).map(([r]) => r).sort((a, z) => z - a)[0];
  const pairRanks = [...boardCount.entries()].filter(([, n]) => n === 2).map(([r]) => r).sort((a, z) => z - a);

  if (tripRank != null) {
    out.push(
      `Опасность борда: на доске трипс (${GEN_PL_RU[tripRank]}) - у любого соперника с карманной парой уже фулл-хаус, и любая карта, спаривающая борд, тоже достраивает фулл. Всё слабее фулла здесь резко обесценено - не считай готовую руку ниже фулла сильной.`,
    );
  } else if (pairRanks.length > 0) {
    const bp = pairRanks[0];
    out.push(
      `Опасность борда: доска спарена (${GEN_PL_RU[bp]}) - фулл-хаус уже в игре: у соперника с ${SG_RU[bp]} трипс, а любая пара к борду достраивает фулл. Две пары и сет здесь уязвимы фуллу.`,
    );

    // Свой фулл может быть младшим: тройка Hero ниже старшей пары борда → соперник с
    // этой парой собирает фулл выше. Считаем по объединённым рангам (не «на глаз»).
    const hero = heroCards.map(parseCard).filter((c): c is Card => c !== null);
    const combined = new Map<number, number>(boardCount);
    for (const c of hero) combined.set(c.rank, (combined.get(c.rank) ?? 0) + 1);
    const heroTrips = [...combined.entries()].filter(([, n]) => n >= 3).map(([r]) => r).sort((a, z) => z - a)[0];
    const mh = heroMadeHand(heroCards, board);
    if (mh?.category === "FULL_HOUSE" && heroTrips != null && bp > heroTrips) {
      out.push(
        `И твой фулл-хаус НЕ старший: тройка у тебя из ${GEN_PL_RU[heroTrips]}, а на борде пара ${GEN_PL_RU[bp]} старше - старший фулл с тройкой ${GEN_PL_RU[bp]} (у соперника с ${SG_RU[bp]} и парной борду картой) бьёт твой. Рука сильная, но не натсовая - крупный банк строй осторожно.`,
      );
    }
  }

  return out;
}

// Факты-v2 фаза 4: вскрытые на шоудауне карты соперников с ГОТОВОЙ комбинацией (правило 1:
// состав руки считает парсер). ТОЛЬКО для вердикта — на этапе диалога карты соперника
// раскрывать нельзя (это спойлер к «прочти его диапазон»). Снимок уже хранит shownCards
// (parser/shared/shown-cards); модель не должна писать «вероятно, сет», когда карты видны.
export function renderShowdownFacts(snapshot: TableSnapshot): string {
  const board = snapshot.board;
  const lines: string[] = [];
  for (const seat of snapshot.seats) {
    if (seat.label === "Hero" || !seat.shownCards || seat.shownCards.length !== 2) continue;
    const cards = seat.shownCards.join(" ");
    const code = handCode(seat.shownCards);
    const mh = board.length >= 3 ? heroMadeHand(seat.shownCards, board) : null;
    if (mh) {
      lines.push(`${seat.label} вскрыл ${cards}${code ? ` (${code})` : ""}: ${mh.ru}.`);
    } else {
      lines.push(`${seat.label} вскрыл ${cards}${code ? ` (${code})` : ""}.`);
    }
  }
  if (lines.length === 0) return "";
  return [
    "Вскрытые карты соперников на шоудауне и их готовая комбинация (посчитал парсер - НЕ гадай «вероятно, сет/флеш», состав руки уже дан):",
    ...lines,
  ].join("\n");
}

export function renderHandFacts(snapshot: TableSnapshot): string {
  const f = computeHandFacts(snapshot);
  const lines: string[] = [];

  // Класс карманных карт — одномастные/разномастные/пара (масти модель не разглядывает сама).
  const code = handCode(snapshot.heroCards);
  if (code) {
    const gloss = code.length === 2 ? "карманная пара" : code.endsWith("s") ? "одномастные" : "разномастные";
    lines.push(`Карманные карты Hero: ${code} (${gloss}).`);
  }

  // Состав стола и позиция Hero — голые факты из снимка, чтобы модель не прикидывала «на глаз».
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (heroSeat) lines.push(`Позиция Hero за столом: ${heroSeat.positionName ?? heroSeat.position}.`);
  const dealt = snapshot.seats.length;
  const tableSize = snapshot.tableSize ?? dealt;
  const foldedPreflop = new Set(
    snapshot.actions.filter((a) => a.street === "PREFLOP" && a.action === "FOLD").map((a) => a.actor),
  );
  const sawFlop = snapshot.board.length >= 3 ? dealt - foldedPreflop.size : null;
  lines.push(
    `За столом ${tableSize} мест, в раздаче ${dealt} игрок(ов)${sawFlop !== null ? `, на флоп пошло ${sawFlop}` : ""}.`,
  );

  // Вердикт эталонного префлоп-чарта (если раздача попала в судимый спот) — чтобы
  // модель не судила префлоп «на глаз» и не спорила с нашими же чартами.
  const chart = preflopChartFact(snapshot);
  if (chart) lines.push(chart);

  // Факты-v2 фазы 1-2: эквити руки Hero против чартового диапазона соперника + фолд-эквити
  // рестила. Цена колла префлоп-олл-ина берётся из уже посчитанного heroFacing (пот-оддс),
  // чтобы модель сравнивала эквити с готовым порогом, а не выводила его сама.
  const preflopFacing = f.heroFacing.find((h) => h.street === "PREFLOP");
  lines.push(...renderChartEquityFacts(snapshot, preflopFacing ? preflopFacing.equityToCallPct : null));

  // Факты-v2 фаза 3: геометрия ре-пуша Hero поверх чужого олл-ина (эффективный риск,
  // возврат излишка, кого реально можно выбить, мёртвые деньги). Пусто, если не ре-пуш.
  const geometry = renderAllInGeometry(snapshot);
  if (geometry) lines.push(geometry);

  if (f.heroStackBb !== null) lines.push(`Стек Hero на старте раздачи: ${f.heroStackBb} BB.`);
  if (f.effectiveStackBb !== null && f.effectiveStackBb !== f.heroStackBb)
    lines.push(`Эффективный стек (против крупнейшего соперника): ${f.effectiveStackBb} BB.`);

  // Текстура борда ПО УЛИЦАМ (как дро и готовая рука ниже). Одна текстура по
  // итоговому борду утекала в более ранние точки решения: модель писала «на тёрне
  // доска монотонная и спаренная», когда третью масть и пару приносил только ривер.
  let prevTexture = "";
  for (const street of ["FLOP", "TURN", "RIVER"] as const) {
    const b = boardUpToStreet(snapshot.board, street);
    if (b.length < 3) continue;
    const t = boardTexture(b);
    if (!t) continue;
    const parts = [SUITEDNESS_RU[t.suitedness], CONNECTED_RU[t.connected]];
    if (t.paired) parts.push("спаренный");
    const text = parts.join(", ");
    if (text === prevTexture) continue;
    prevTexture = text;
    lines.push(`Текстура борда на ${STREET_RU[street]}: ${text}.`);
  }

  if (f.sprFlop !== null) lines.push(`SPR на флопе: ${f.sprFlop} (эффективный остаток к банку флопа).`);

  // Дро Hero ПО УЛИЦАМ (флоп/тёрн) — считаем на каждой, т.к. на полном борде (ривер)
  // дро уже нет, и иначе флоп/тёрн-дро вообще не попало бы в факты (так модель его
  // выдумывала или ставила не на ту улицу). Ривер пропускаем — там дро не бывает.
  // Ауты/эквити — точным перебором (draws.ts): сырое и чистое (грязные ауты помечены),
  // бэкдоры учтены. Эквити к риверу (на флопе — 2 карты, на тёрне — 1).
  let drawSeen = false;
  let prevDraw = "";
  for (const street of ["FLOP", "TURN"] as const) {
    const b = boardUpToStreet(snapshot.board, street);
    if (b.length < 3) continue;
    const d = readHeroDraw(snapshot.heroCards, b);
    if (!d) continue;
    drawSeen = true;
    const eq = drawEquity(snapshot.heroCards, b, b.length === 3 ? 2 : 1);
    const eqStr = eq ? (eq.cleanPct === eq.rawPct ? `≈${eq.rawPct}%` : `≈${eq.cleanPct}–${eq.rawPct}%`) : "";
    const key = `${d.kind}|${d.outsRaw}|${d.outsClean}|${eqStr}`;
    if (key === prevDraw) continue;
    prevDraw = key;
    if (d.backdoorOnly) {
      lines.push(
        `Дро Hero на ${STREET_RU[street]}: ${d.kind} — добор только раннер-раннером, эквити к риверу ${eqStr} (мало).`,
      );
    } else {
      const cleanPart =
        d.outsClean < d.outsRaw && d.taintReason ? `, из них ~${d.outsClean} чистых (${d.taintReason})` : "";
      lines.push(`Дро Hero на ${STREET_RU[street]}: ${d.kind} — ${d.outsRaw} аутов${cleanPart}; эквити к риверу ${eqStr}.`);
    }
  }
  if (snapshot.board.length >= 3 && !drawSeen)
    lines.push("Дро у Hero нет (ни флеш-дро, ни стрит-дро) — на дро ты не попал, не приписывай его.");

  // ВСЕ ауты Hero на улучшение (не только флеш/стрит-дро): любая карта, поднимающая
  // категорию руки — пара/две пары/сет/фулл и т.д. Перебором (правило 1), чтобы у тренера
  // ВСЕГДА было честное число, а не выдуманное (баг «сет из 6 аутов» у 77 на монотоне).
  // Отдельно всего/чистых: грязные ауты усиливают номинально, но обычно оставляют позади.
  let prevOuts = "";
  for (const street of ["FLOP", "TURN"] as const) {
    const b = boardUpToStreet(snapshot.board, street);
    if (b.length < 3) continue;
    const io = improvementOuts(snapshot.heroCards, b);
    if (!io) continue;
    const parts = io.byTarget.map(
      (t) => `${t.count} до ${t.toCategory}${t.dirty > 0 ? ` (${t.dirty} грязных)` : ""}`,
    );
    const key = `${io.outsRaw}|${io.outsClean}|${parts.join(",")}`;
    if (key === prevOuts) continue;
    prevOuts = key;
    let line = `Ауты Hero на улучшение на ${STREET_RU[street]} (перебор колоды, следующая карта; любое повышение руки): всего ${io.outsRaw}, из них чистых ${io.outsClean}. Разбивка: ${parts.join(", ")}.`;
    if (io.taintReasons.length > 0)
      line += ` Грязные ауты ${io.taintReasons.join("; ")} — усиливают руку номинально, но обычно оставляют позади; игроку опирайся на ЧИСТЫЕ, а не на общее число.`;
    lines.push(line);
  }

  // Готовая рука Hero по улицам — состав комбинации считает парсер (правило 1), чтобы
  // модель не выдумывала «пару, которой нет» и не путала фулл с двумя парами. Показываем
  // по мере роста борда, без повторов; последняя строка = рука Hero на вскрытии.
  let prevMade = "";
  for (const street of ["FLOP", "TURN", "RIVER"] as const) {
    const b = boardUpToStreet(snapshot.board, street);
    if (b.length < 3) continue;
    const mh = heroMadeHand(snapshot.heroCards, b);
    if (!mh || mh.ru === prevMade) continue;
    prevMade = mh.ru;
    lines.push(`Готовая рука Hero на ${STREET_RU[street]}: ${mh.ru}.`);
  }

  // Маркеры опасности борда (фаза 4) ПО УЛИЦАМ — как текстура/готовая рука/ауты выше:
  // спаренный/тройной борд → фулл-хаус в игре, свой фулл может быть младшим. Считаем на
  // каждой улице отдельно и метим улицей, чтобы пара/трипс, пришедшие только на ривере, не
  // утекали в пре-риверное решение (тот же лик, что чинили поуличной текстурой). Дедуп по
  // содержанию: опасность, не изменившаяся с прошлой улицы, второй раз не повторяем.
  let prevDanger = "";
  for (const street of ["FLOP", "TURN", "RIVER"] as const) {
    const b = boardUpToStreet(snapshot.board, street);
    if (b.length < 3) continue;
    const dangers = boardDangerFacts(snapshot.heroCards, b);
    if (dangers.length === 0) continue;
    const key = dangers.join("|");
    if (key === prevDanger) continue;
    prevDanger = key;
    for (const d of dangers) lines.push(d.replace("Опасность борда:", `Опасность борда на ${STREET_RU[street]}:`));
  }

  for (const b of f.bets)
    lines.push(
      `Ставка соперника (${b.actor}, ${b.street}): ≈${b.sizePctOfPot}% банка (${SIZE_CLASS_RU[b.sizeClass]}).`,
    );
  for (const b of f.heroBets) {
    // foldsNeededPct — ДОЛЯ ДИАПАЗОНА соперника, которая должна сброситься, а НЕ «частота
    // раз» (правка Артёма 2026-07-10, синхронизирована с цитатой порога в COACH_FRAMEWORK).
    let line = `Ставка Hero (${b.street}): ≈${b.sizePctOfPot}% банка (${SIZE_CLASS_RU[b.sizeClass]}); как блеф окупается, если сбросится ≥${b.foldsNeededPct}% диапазона соперника.`;
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

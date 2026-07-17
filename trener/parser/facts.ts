import type { Street, TableAction, TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { equityVsHandPreflop } from "./cooler";
import { boardUpToStreet, tableStateUpTo } from "./table-state";
import {
  heroMadeHand,
  madeHandCategoryRu,
  cardSetValue,
  compareValues,
  madeHandNutStatus,
  madeHandVulnerability,
  madeHandKicker,
  nutFlushBlocker,
} from "./made-hand";
import {
  readHeroDraw,
  drawEquity,
  improvementOuts,
  overcardsToPair,
  scareCards,
  fallenCardImpact,
  type DrawRead,
} from "./draws";
import { fullDeckOdds } from "./range-buckets";
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
  // нужный добор превышает остаток Hero после колла → физически недостижим (по эквити это фолд).
  impliedUnreachable?: boolean;
  // у Hero УЖЕ готовая рука пара+ на этой улице → дро это апсайд, а не основание колла (иначе факт
  // звал топ-пару «слабым дро 19%, нужны обратные оддсы» — ревью согласованности).
  madeValue?: boolean;
  // Замазанность (свип): доля стартового стека Hero, вложенная ДОБРОВОЛЬНО (без форсов-анте) до
  // этого решения.
  committedBeforePct?: number;
  // Остаток Hero после колла, BB (0 — колл ставит в олл-ин).
  remainingAfterCallBb?: number;
  // Колл ставит Hero в олл-ин (дальше улиц нет).
  heroAllInOnCall?: boolean;
  // Замазан: НЕ олл-ин, но вложена заметная доля стека и остаток после колла ≤ банка (SPR<1).
  potCommitted?: boolean;
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
  // у Hero УЖЕ есть готовая рука пара+ (тогда ставка с дро — велью с добором, НЕ полу-блеф).
  madeValue?: boolean;
  // геометрия второго барреля (свип): если эту ставку заколлируют, SPR на СЛЕДУЮЩЕЙ улице.
  // Показывает, коммитит ли баррель стек (SPR≤1 → следующая улица уже олл-ин-или-фолд). Только
  // флоп/тёрн (у ривера следующей улицы нет) и когда соперник может заколлировать не в олл-ин.
  nextStreetSpr?: number;
  commitsStack?: boolean; // nextStreetSpr ≤ 1
};

// Геометрия НЕ-олл-ин префлоп-агрессии Hero (свип): опен/изоляция/3-бет — риск против мёртвых
// денег и break-even фолд-эквити ЧИСЛОМ (пуши покрыты push-fold/chart-equity, их не берём).
export type PreflopAggression = {
  riskBb: number; // сколько Hero добавляет (delta), BB
  deadMoneyBb: number; // банк ДО рейза Hero (блайнды+анте+лимпы+пред. рейзы), BB
  foldsNeededPct: number; // break-even фолд-эквити = risk / (dead + risk)
  kind: "опен" | "изоляция" | "3-бет" | "4-бет+";
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
  preflopAgg: PreflopAggression | null;
};

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (n: number) => Math.round(n * 100);

// Прогон банка по действиям. amount у RAISE — абсолютная сумма «to» на улице,
// у BET/CALL/POST — добавляемая дельта (см. parseActions). ALL_IN однозначим по
// порогу: сумма больше текущей ставки на улице → это рейз «to amount», иначе колл-дельта.
// Факт бета/рейза Hero: размер, фолд-эквити, банк при колле и (если есть дро) полу-блеф.
// risk — добавляемые фишки (для бета весь amt, для рейза дельта); potBefore — банк ДО действия.
// heroRemAfterBet — остаток Hero ПОСЛЕ этой ставки; effOppRem — остаток эффективного соперника ДО
// колла (для геометрии второго барреля: SPR следующей улицы, если ставку заколлируют).
function heroBetFact(
  snapshot: TableSnapshot,
  street: Street,
  risk: number,
  potBefore: number,
  heroRemAfterBet: number,
  effOppRem: number,
  oppCall: number,
): HeroBet {
  const size = pct(risk / potBefore);
  const fact: HeroBet = {
    street,
    sizePctOfPot: size,
    sizeClass: sizeClass(size),
    foldsNeededPct: pct(risk / (potBefore + risk)),
    // если соперник коллирует: банк = было + риск Hero + сколько РЕАЛЬНО доложит соперник (при
    // чек-рейзе он уже вложил, докладывает МЕНЬШЕ risk — ревью доводок).
    potIfCalled: potBefore + risk + oppCall,
  };
  // Геометрия второго барреля: SPR следующей улицы, если ставку заколлируют. Только флоп/тёрн (у
  // ривера следующей улицы нет) и когда соперник может доложить НЕ в олл-ин (иначе улиц дальше нет).
  if (street !== "RIVER" && heroRemAfterBet > 0 && oppCall > 0 && effOppRem > oppCall) {
    const effRemNext = Math.min(heroRemAfterBet, effOppRem - oppCall); // что можно разыграть на след. улице
    if (effRemNext > 0) {
      fact.nextStreetSpr = round1(effRemNext / fact.potIfCalled);
      fact.commitsStack = fact.nextStreetSpr <= 1;
    }
  }
  // Бет Hero с дро: показываем силу дро к риверу (2 карты на флопе, 1 на тёрне). Если своей готовой
  // руки нет — это полу-блеф; если пара+ уже есть — велью-ставка с добором (не блеф, ревью-дамп).
  const b = boardUpToStreet(snapshot.board, street);
  const eq = drawEquity(snapshot.heroCards, b, b.length === 3 ? 2 : 1);
  if (eq && eq.rawPct > 0) fact.drawEquityPct = eq.cleanPct > 0 ? eq.cleanPct : eq.rawPct;
  const mh = heroMadeHand(snapshot.heroCards, b);
  if (mh && mh.strength !== "AIR" && mh.category !== "HIGH") fact.madeValue = true;
  return fact;
}

// Первая НЕ-олл-ин агрессия Hero на префлопе (опен/изоляция/3-бет): мёртвые деньги в банке ДО
// рейза + break-even фолд-эквити числом. Раньше heroBets резались на street!=="PREFLOP" (там %банка
// не мерят), а геометрию стила модель считала на глаз. Пуш (олл-ин) пропускаем — он покрыт push-
// fold/chart-equity. Отдельный прогон только префлопа, чтобы не усложнять walkPot. Правило 1.
function preflopAggressionFact(snapshot: TableSnapshot, bigBlind: number | null): PreflopAggression | null {
  if (!bigBlind) return null;
  const starting = new Map<string, number>();
  for (const s of snapshot.seats) starting.set(s.label, s.startingStack);
  let pot = 0;
  let currentBet = 0;
  const committedMap = new Map<string, number>();
  const invested = new Map<string, number>();
  let raisesBefore = 0; // добровольные рейзы ДО агрессии Hero
  let limpsBefore = 0; // лимпы (коллы на неповышенном банке) ДО Hero
  const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break;
    const committed = committedMap.get(a.actor) ?? 0;
    switch (a.action) {
      case "POST_ANTE":
        pot += a.amount ?? 0; // анте — мёртвые деньги, но не «ставка» к коллу (currentBet не трогаем)
        add(invested, a.actor, a.amount ?? 0);
        break;
      case "POST_SB":
        pot += a.amount ?? 0;
        committedMap.set(a.actor, a.amount ?? 0);
        add(invested, a.actor, a.amount ?? 0);
        break;
      case "POST_BB":
        pot += a.amount ?? 0;
        committedMap.set(a.actor, a.amount ?? 0);
        add(invested, a.actor, a.amount ?? 0);
        currentBet = Math.max(currentBet, a.amount ?? 0);
        break;
      case "FOLD":
      case "CHECK":
        break;
      case "CALL": {
        const amt = a.amount ?? 0;
        committedMap.set(a.actor, committed + amt);
        pot += amt;
        add(invested, a.actor, amt);
        if (a.actor !== "Hero" && raisesBefore === 0) limpsBefore += 1; // колл на неповышенном = лимп
        break;
      }
      case "BET":
      case "RAISE":
      case "ALL_IN": {
        const raw = a.amount ?? 0;
        const isBet = a.action === "BET";
        const isRaise = a.action === "RAISE" || isBet || raw > currentBet;
        if (!isRaise) {
          // олл-ин как колл-дельта — не агрессия
          committedMap.set(a.actor, committed + raw);
          pot += raw;
          add(invested, a.actor, raw);
          break;
        }
        // абсолют «to»: для BET дельта = raw (ставки на улице ещё не было), для RAISE/ALL_IN raw = to
        const delta = isBet ? raw : Math.max(raw - committed, 0);
        const potBefore = pot; // мёртвые деньги ДО этой агрессии
        if (a.actor === "Hero") {
          const investedBefore = invested.get("Hero") ?? 0;
          const heroRemaining = (starting.get("Hero") ?? 0) - investedBefore;
          if (delta >= heroRemaining) return null; // пуш — покрыт push-fold, не берём
          if (potBefore <= 0) return null;
          const kind: PreflopAggression["kind"] =
            raisesBefore >= 2 ? "4-бет+" : raisesBefore === 1 ? "3-бет" : limpsBefore > 0 ? "изоляция" : "опен";
          return {
            riskBb: round1(delta / bigBlind),
            deadMoneyBb: round1(potBefore / bigBlind),
            foldsNeededPct: pct(delta / (potBefore + delta)),
            kind,
          };
        }
        // не Hero: обновляем банк/ставку и счётчик рейзов
        committedMap.set(a.actor, isBet ? committed + raw : raw);
        pot += delta;
        add(invested, a.actor, delta);
        currentBet = isBet ? committed + raw : raw;
        raisesBefore += 1;
        break;
      }
    }
  }
  return null;
}

function walkPot(snapshot: TableSnapshot, bigBlind: number | null): HandFacts {
  const startingStack = new Map<string, number>();
  for (const s of snapshot.seats) startingStack.set(s.label, s.startingStack);

  let pot = 0;
  let currentBet = 0;
  let street: Street = "PREFLOP";
  const streetCommitted = new Map<string, number>();
  const invested = new Map<string, number>(); // суммарно вложено за раздачу (вкл. анте)
  const folded = new Set<string>();
  let heroAnte = 0; // форсы-анте Hero — исключаем из «замазанности» (не добровольный вклад)

  const bets: BetFact[] = [];
  const heroFacing: HeroFacingBet[] = [];
  const heroBets: HeroBet[] = [];

  let potAtFlop: number | null = null;
  let investedAtFlop: Map<string, number> | null = null;
  let foldedAtFlop: Set<string> | null = null;

  const addInvested = (actor: string, delta: number) =>
    invested.set(actor, (invested.get(actor) ?? 0) + delta);

  // Геометрия ставки Hero для SPR следующей улицы (второй баррель). Вызывать ДО addInvested ставки.
  // heroStreetTotal = ставка Hero НА УЛИЦЕ целиком (currentBet после неё). oppCall = сколько реально
  // доложит эффективный соперник = heroStreetTotal − его вклад на улице (при чек-рейзе он уже вложил,
  // доложит МЕНЬШЕ risk — ревью доводок). Эффективный соперник = минимальный остаток СРЕДИ ЖИВЫХ С
  // ОСТАТКОМ >0 (олл-инные соперники на след. улице не действуют, их не берём — ревью LOW).
  const heroBetGeom = (risk: number, heroStreetTotal: number) => {
    const heroRemAfterBet = (startingStack.get("Hero") ?? 0) - (invested.get("Hero") ?? 0) - risk;
    const opps = snapshot.seats
      .filter((s) => s.label !== "Hero" && !folded.has(s.label))
      .map((s) => ({
        rem: (startingStack.get(s.label) ?? 0) - (invested.get(s.label) ?? 0),
        committed: streetCommitted.get(s.label) ?? 0,
      }))
      .filter((o) => o.rem > 0);
    if (opps.length === 0) return { heroRemAfterBet, effOppRem: 0, oppCall: 0 };
    const eff = opps.reduce((min, o) => (o.rem < min.rem ? o : min));
    const oppCall = Math.min(Math.max(heroStreetTotal - eff.committed, 0), eff.rem);
    return { heroRemAfterBet, effOppRem: eff.rem, oppCall };
  };

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
        if (a.actor === "Hero") heroAnte += a.amount ?? 0;
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
          const g = heroBetGeom(amt, committed + amt);
          heroBets.push(heroBetFact(snapshot, street, amt, pot, g.heroRemAfterBet, g.effOppRem, g.oppCall));
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
            const g = heroBetGeom(delta, raw);
            heroBets.push(heroBetFact(snapshot, street, delta, pot, g.heroRemAfterBet, g.effOppRem, g.oppCall));
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
      const rawToCall = currentBet - heroCommitted;
      // Нельзя доложить больше, чем осталось в стеке Hero: если соперник шовит больше стека
      // Hero, излишек шова возвращается (Uncalled bet). Цена колла = остаток Hero, а банк к
      // взятию — без этого непокрытого излишка. Без этого тренер говорил «доложить 40» при
      // стеке 10 и завышал требуемое эквити (та же арифметика, что в allin-geometry.ts).
      const heroRemaining = (startingStack.get("Hero") ?? 0) - (invested.get("Hero") ?? 0);
      const toCall = Math.min(rawToCall, Math.max(heroRemaining, 0));
      if (toCall > 0) {
        // Банк к РЕАЛЬНОМУ взятию (main pot Hero): каждый игрок матчится максимум до полного
        // вклада Hero после колла; излишки соперников сверх этого уходят в сайд-пот, который
        // Hero не выигрывает. Верно и в хедз-апе, и в мультивее (несколько шовов больше стека
        // Hero) — раньше вычитался лишь ОДИН излишек и пот-оддс завышались. Пот-оддс = toCall/mainPot
        // (mainPot уже включает toCall Hero), чтобы не было «доложить 40» при стеке 10.
        const heroTotal = (invested.get("Hero") ?? 0) + toCall;
        let mainPot = heroTotal;
        for (const [label, inv] of invested) {
          if (label === "Hero") continue;
          mainPot += Math.min(inv, heroTotal);
        }
        const heroAllIn = toCall >= heroRemaining; // колл ставит Hero в олл-ин — улиц дальше нет
        const last = heroFacing[heroFacing.length - 1];
        const fact: HeroFacingBet = {
          street,
          toCall,
          equityToCallPct: pct(toCall / mainPot),
        };
        // Замазанность (свип): доля стека Hero уже в банке, что останется после колла, олл-ин ли.
        // Раньше «замазан/committed» модель считала на глаз — теперь голые числа парсера.
        const investedBefore = invested.get("Hero") ?? 0;
        // Добровольно вложенное = без форсов-анте (анте в банке независимо от решения, «замазанности»
        // не создаёт — ревью факта 2). Свой блайнд оставляем: это уже ставка к текущему беттингу.
        const investedVoluntary = Math.max(investedBefore - heroAnte, 0);
        const startHero = startingStack.get("Hero") ?? 0;
        const remainingAfterCall = Math.max(heroRemaining - toCall, 0);
        if (startHero > 0) fact.committedBeforePct = pct(investedVoluntary / startHero);
        if (bigBlind) fact.remainingAfterCallBb = round1(remainingAfterCall / bigBlind);
        fact.heroAllInOnCall = heroAllIn;
        // Замазан: НЕ олл-ин, вложил ≥1/3 стека, и остаток после колла СТРОГО меньше банка (SPR<1).
        fact.potCommitted =
          !heroAllIn && (fact.committedBeforePct ?? 0) >= 33 && remainingAfterCall > 0 && remainingAfterCall < mainPot;
        // Дро: эквити к следующей карте. Против олл-ина (или когда колл ставит Hero в олл-ин)
        // видно обе оставшиеся карты сразу. Берём чистое эквити.
        const b = boardUpToStreet(snapshot.board, street);
        const facingAllIn = a.action === "ALL_IN";
        const cardsToCome = b.length === 3 && (facingAllIn || heroAllIn) ? 2 : 1;
        const eq = drawEquity(snapshot.heroCards, b, cardsToCome);
        if (eq && eq.rawPct > 0) {
          const equity = eq.cleanPct > 0 ? eq.cleanPct : eq.rawPct;
          fact.drawEquityPct = equity;
          // Обратные (имплайд) оддсы имеют смысл ТОЛЬКО если впереди есть улицы для добора.
          // Когда колл — олл-ин (свой или соперника), добирать нечего: имплайды не считаем.
          if (!heroAllIn && !facingAllIn) {
            const p = equity / 100;
            // нужное p ≥ toCall/(mainPot + X) → X = toCall/p − mainPot
            const extra = p > 0 ? toCall / p - mainPot : 0;
            if (extra > 0) {
              fact.impliedExtraNeeded = Math.round(extra);
              // Добрать за руку можно максимум остаток Hero после колла (больше своего стека не
              // разыграешь). Если нужный добор больше — имплайды недостижимы, по эквити это фолд.
              // Раньше факт советовал невозможный добор рядом с «ты замазан» (ревью, интеграция).
              if (extra > remainingAfterCall) fact.impliedUnreachable = true;
            }
          }
        }
        // Готовая рука Hero пара+ на этой улице → дро это апсайд, не основание колла: иначе факт звал
        // топ-пару «слабым дро 19%, нужны обратные оддсы» (ревью согласованности).
        const mhFacing = heroMadeHand(snapshot.heroCards, b);
        if (mhFacing && mhFacing.strength !== "AIR" && mhFacing.category !== "HIGH") fact.madeValue = true;
        // один спот на улицу — оставляем последний (самый крупный to-call)
        if (last && last.street === street) heroFacing[heroFacing.length - 1] = fact;
        else heroFacing.push(fact);
      }
    }
  }

  const heroStack = startingStack.get("Hero") ?? null;
  const heroStackBb = heroStack !== null && bigBlind ? round1(heroStack / bigBlind) : null;

  // Эффективный стек = меньший из Hero и наибольшего соперника, С КЕМ РЕАЛЬНО ИГРАЕМ:
  // сбросившихся до флопа исключаем (иначе против живого коротыша число завышалось стеком
  // соседа, спасовавшего на префлопе). До флопа не дошли (префлоп-олл-ин) — берём тех, кто
  // не сбросился к концу префлопа (folded).
  const foldedByFlop = foldedAtFlop ?? folded;
  const opponentStacks = snapshot.seats
    .filter((s) => s.label !== "Hero" && !foldedByFlop.has(s.label))
    .map((s) => s.startingStack);
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
    preflopAgg: preflopAggressionFact(snapshot, bigBlind),
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

const STREET_ORDER: Street[] = ["PREFLOP", "FLOP", "TURN", "RIVER"];

// ── Улицы, которые Hero реально ПРОЖИЛ ──────────────────────────────────────────────────────
// Разбор 2026-07-17 нашёл корень целого класса вранья: Hero сбросил на префлопе, а факты всё
// равно рассказывают ему изъявительным наклонением, что было бы дальше — «Готовая рука Hero на
// флопе: трипс троек», «на ривере: каре троек», «Расклады… ты впереди 1060», ауты, угрозы.
// Модель фактам ВЕРИТ и достраивает назад: «трипс троек? значит была карманная пара» → советует
// сет-майнинг рукой T3o (регресс #25). Так же родились «на тёрне ты усилился до фулл-хауса» (#9)
// и «борд в итоге дал тебе каре» (#34): 19 из 29 префлоп-фолдов, у ВСЕХ моделей.
// Промпт запрещает это одной строкой («не пересказывай сброшенной руке её несыгранное будущее») —
// и проигрывает дюжине строк-фактов, которые говорят обратное. Поэтому режем у источника.
//
// Улица, на которой Hero СБРОСИЛ, считается прожитой: решение он принимал, видя её борд.
// Всё, что после, — призрак. Не фолдил → прожил всё (борд ограничит сам).
export function heroLastStreet(snapshot: TableSnapshot): Street | null {
  const fold = snapshot.actions.find((a) => a.actor === "Hero" && a.action === "FOLD");
  return fold ? fold.street : null;
}

export function heroSawStreet(snapshot: TableSnapshot, street: Street): boolean {
  const last = heroLastStreet(snapshot);
  if (!last) return true;
  return STREET_ORDER.indexOf(street) <= STREET_ORDER.indexOf(last);
}

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
// Точное эквити Hero против ВСКРЫТЫХ рук на момент ПРЕФЛОП-олл-ина (Артём, 17.07): дорогие
// раздачи — почти всегда префлоп-олл-ины, а для них парсер эквити против диапазона не считает
// (перебор бордов неподъёмен), поэтому тренер сочинял «хорошее эквити»/«с запасом», хваля даже
// доминацию (AJs в олл-ине против вскрытого AKs — реально 26%). Здесь карты соперника ВСКРЫТЫ,
// значит эквити считается ТОЧНО и дёшево — детерминированным Монте-Карло (equityVsHandPreflop,
// то же зерно-из-карт, что у детектора кулеров; воспроизводимо, Правило 1). Это эквити РЕШЕНИЯ
// (до флопа, борд ещё неизвестен), поэтому судит заход, а не итог. Только для вердикта/чата
// (спойлер вскрытия), поэтому живёт внутри renderShowdownFacts.
function preflopAllInEquityLine(snapshot: TableSnapshot): string | null {
  const hero = snapshot.heroCards;
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  const bb = bigBlindFromSnapshot(snapshot);
  if (!hero || hero.length !== 2 || !heroSeat || !bb) return null;
  if (snapshot.actions.some((a) => a.actor === "Hero" && a.action === "FOLD")) return null; // Hero сбросил — своей руки не было
  // Гейт: ПОСЛЕДНЕЕ крупное добровольное вложение Hero было на ПРЕФЛОПЕ (олл-ин до флопа). Постфлоп
  // эквити уже даёт equityVsHand/range-equity — этот факт закрывает именно префлоп, где их нет.
  const minAmount = Math.max(5 * bb, heroSeat.startingStack * 0.1);
  let lastBigStreet: Street | null = null;
  for (const a of snapshot.actions) {
    if (a.actor !== "Hero") continue;
    if (a.action !== "CALL" && a.action !== "RAISE" && a.action !== "ALL_IN" && a.action !== "BET") continue;
    if ((a.amount ?? 0) < minAmount) continue;
    lastBigStreet = a.street;
  }
  if (lastBigStreet !== "PREFLOP") return null;

  const shown = snapshot.seats.filter((s) => s.label !== "Hero" && s.shownCards?.length === 2);
  if (shown.length === 0) return null;
  const parts: string[] = [];
  for (const s of shown) {
    const eq = equityVsHandPreflop(hero, s.shownCards!);
    if (eq === null) continue;
    const pos =
      s.positionName && s.positionName !== "OTHER" ? s.positionName : s.position !== "OTHER" ? s.position : "соперник";
    const code = handCode(s.shownCards!);
    const tag =
      eq < 35 ? " — ты был ПОЗАДИ (доминация/андердог)" : eq >= 62 ? " — ты был впереди" : " — по сути флип";
    parts.push(`против ${pos} (${s.shownCards!.join(" ")}${code ? ` ${code}` : ""}) ≈${eq}%${tag}`);
  }
  if (parts.length === 0) return null;
  return `ТВОЁ ТОЧНОЕ ЭКВИТИ на момент олл-ина (ДО флопа, честный перебор — это то, что ты реально имел, когда РЕШАЛ, а не итог по борду): ${parts.join("; ")}. Суди СВОЁ решение по этим числам, а НЕ по результату: проиграл, будучи впереди или во флипе, — это дисперсия, а не ошибка; закинул стек, будучи далеко позади, — вопрос к самому заходу. «Хорошее эквити» тут выдумывать нельзя — вот оно, точное.`;
}

export function renderShowdownFacts(snapshot: TableSnapshot): string {
  const board = snapshot.board;
  const heroCards = snapshot.heroCards;
  // Готовая рука Hero и её сравнимое значение на вскрытии — чтобы отдать модели ГОТОВЫЙ
  // ответ «кто старше», а не заставлять её ранжировать руки прозой (правило 1). Без этого
  // на спаренном борде с общей парой (напр. QQ432: у Hero QQ+66, у соперника QQ+JJ, спор
  // идёт по МЛАДШЕЙ паре) модель путает тай-брейк и объявляет победителем слабейшую руку.
  // Строку сравнения даём ТОЛЬКО если Hero реально дошёл до вскрытия: не фолдил и борд полный.
  // Иначе (мультивей, где Hero сбросил, а соперники вскрылись) руки Hero на шоудауне не было —
  // «твоя рука выиграла/проиграла» стало бы ложным фактом, который модели запрещено оспаривать.
  const heroFolded = snapshot.actions.some((a) => a.actor === "Hero" && a.action === "FOLD");
  const heroInShowdown = heroCards.length === 2 && board.length === 5 && !heroFolded;
  const heroMh = heroInShowdown ? heroMadeHand(heroCards, board) : null;
  const heroVal = heroInShowdown ? cardSetValue([...heroCards, ...board]) : null;

  const lines: string[] = [];
  for (const seat of snapshot.seats) {
    if (seat.label === "Hero" || !seat.shownCards || seat.shownCards.length !== 2) continue;
    const cards = seat.shownCards.join(" ");
    const code = handCode(seat.shownCards);
    const mh = board.length >= 3 ? heroMadeHand(seat.shownCards, board) : null;
    let line = mh
      ? `${seat.label} вскрыл ${cards}${code ? ` (${code})` : ""}: ${mh.ru}.`
      : `${seat.label} вскрыл ${cards}${code ? ` (${code})` : ""}.`;
    // Детерминированный итог вскрытия против руки Hero (кто старше). Строка про КОНКРЕТНОГО
    // соперника, поэтому мультивей-безопасна: против одного можно выиграть, другому проиграть.
    // «банк по этой руке ты не забрал» аккуратнее, чем «весь банк» — не врём про сайд-поты.
    if (heroVal && heroMh && mh) {
      const cmp = compareValues(heroVal, cardSetValue([...seat.shownCards, ...board]));
      if (cmp < 0)
        line += ` На вскрытии твоя рука (${heroMh.ru}) проиграла этой - ${mh.ru} старше; банк по этой руке ты не забрал.`;
      else if (cmp > 0)
        line += ` На вскрытии твоя рука (${heroMh.ru}) старше этой - против неё ты выиграл вскрытие.`;
      else line += ` На вскрытии твоя рука (${heroMh.ru}) и эта равны по силе - дележ банка.`;
    }
    lines.push(line);
  }

  // Кто забрал банк — детерминированно из HH-строк «collected» (парсер проставил Seat.collected).
  // Исход, который модель раньше выводила из ЗНАКА chipResult (ненадёжно в мультивее/сайд-потах).
  // Как и вскрытие — только для вердикта/чата (после раздачи), спойлера тут нет.
  const bb = bigBlindFromSnapshot(snapshot);
  const winners = snapshot.seats.filter((s) => (s.collected ?? 0) > 0);
  const winnerLine =
    winners.length > 0 && bb
      ? `Банк по итогам забрал: ${winners
          .map((s) => {
            const pos = s.positionName && s.positionName !== "OTHER" ? s.positionName : s.position !== "OTHER" ? s.position : null;
            const who = s.label === "Hero" ? "ты" : pos ?? "соперник";
            return `${who} - ${round1((s.collected ?? 0) / bb)} BB`;
          })
          .join("; ")} (посчитал парсер по строкам выигрыша - НЕ выводи победителя из знака результата).`
      : "";

  const out: string[] = [];
  if (winnerLine) out.push(winnerLine);
  const eqLine = preflopAllInEquityLine(snapshot);
  if (eqLine) out.push(eqLine);
  if (lines.length > 0)
    out.push(
      "Вскрытые карты соперников на шоудауне и их готовая комбинация (посчитал парсер - НЕ гадай «вероятно, сет/флеш», состав руки уже дан). Кто из рук старше на вскрытии - тоже посчитал парсер, не переопределяй это сам:",
      ...lines,
    );
  else
    // Никто не вскрылся — говорим об этом ПРЯМО. Раньше тут была тишина, и модель заполняла её
    // сама: аудит 2026-07-16 поймал выдуманное вскрытие целиком («игрок на BB имел фулл-хаус»,
    // причём рукой самого Hero) и карты «88» у соперника, с которыми он бы проиграл. Отсутствие
    // факта — тоже факт, и его надо называть (правило проекта: факта нет → говорим, что его нет).
    // Функция зовётся только из вердикта и чата (ПОСЛЕ раздачи), поэтому спойлера здесь нет.
    out.push(
      "Карты соперников: никто не вскрылся, HH их не показывает. Чего у них было - неизвестно и не станет известно: не пиши «у него оказался/был <рука>» и не называй их конкретных карт. Про их руки можно говорить только диапазоном («с такой линией сюда заходят…»).",
    );
  return out.join("\n");
}

// Сводка флеш-угрозы (регресс #85/#53): детерминированно — сколько карт ОДНОЙ масти на борде и у
// Hero, чтобы модель не выдумывала «натсовый флеш»/«флеш-дро» на масти, которой нет (#85: «натсовый
// флеш» на борде с двумя бубнами; #53: «флеш-дро» без своих карт масти). Считаем по финальному борду.
const SUIT_RU_GEN: Record<string, string> = { s: "пик", h: "червей", d: "бубён", c: "треф" };
export function renderFlushSummary(hero: string[], board: string[]): string | null {
  if (board.length < 3) return null;
  const suits = ["s", "h", "d", "c"];
  const boardN = (s: string) => board.filter((c) => c.length >= 2 && c[1].toLowerCase() === s).length;
  const heroN = (s: string) => hero.filter((c) => c.length >= 2 && c[1].toLowerCase() === s).length;
  // Флеш/дро У HERO — по масти с максимумом карт (борд+рука). Дро = 4 карты одной масти.
  let bestSuit = "s";
  for (const s of suits) if (boardN(s) + heroN(s) > boardN(bestSuit) + heroN(bestSuit)) bestSuit = s;
  const bestTotal = boardN(bestSuit) + heroN(bestSuit);
  const bestRu = SUIT_RU_GEN[bestSuit] ?? bestSuit;
  if (bestTotal >= 5) return `Флеш-угроза: у тебя СОБРАН флеш ${bestRu} (${heroN(bestSuit)} в руке + ${boardN(bestSuit)} на борде).`;
  // Дро считаем только пока есть будущая карта: на ривере (борд=5) 4 карты масти — это уже НЕ дро,
  // флеша нет (регресс #85: A7 бубны на ривере, 4 бубны без пятой — «натсового флеша» нет).
  if (bestTotal === 4 && board.length < 5)
    return `Флеш-угроза: у тебя ФЛЕШ-ДРО ${bestRu} (${heroN(bestSuit)} в руке + ${boardN(bestSuit)} на борде, не хватает одной карты) - но это ещё НЕ флеш.`;
  if (bestTotal === 4 && board.length === 5)
    return `Флеш-угроза: до ривера у тебя было флеш-дро ${bestRu} (4 карты масти), но пятая не пришла - флеша НЕТ, не пиши, что собрал флеш.`;
  // Своего флеша/дро нет. Угроза соперника — по масти с максимумом НА БОРДЕ (3+ = флеш возможен у него).
  let maxBoardSuit = "s";
  for (const s of suits) if (boardN(s) > boardN(maxBoardSuit)) maxBoardSuit = s;
  const maxBoardN = boardN(maxBoardSuit);
  if (maxBoardN < 3) {
    return `Флеш-угроза: на борде максимум ${maxBoardN} карты одной масти, у тебя тоже нет 4 одной масти - флеша и флеш-дро НЕТ ни у тебя, ни у соперника, не выдумывай флеш.`;
  }
  return `Флеш-угроза: на борде ${maxBoardN} карт(ы) масти ${SUIT_RU_GEN[maxBoardSuit] ?? maxBoardSuit}, а у тебя этой масти нет - СВОЕГО флеша и флеш-дро у тебя НЕТ (флеш возможен только у соперника), не приписывай флеш или флеш-дро себе.`;
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

  // Сводка флеш-угрозы — детерминированно, чтобы модель не выдумывала флеш/флеш-дро (регресс #85/#53).
  const flushLine = renderFlushSummary(snapshot.heroCards, snapshot.board);
  if (flushLine) lines.push(flushLine);

  // Состав стола и позиция Hero — голые факты из снимка, чтобы модель не прикидывала «на глаз».
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (heroSeat) lines.push(`Позиция Hero за столом: ${heroSeat.positionName ?? heroSeat.position}.`);
  const dealt = snapshot.seats.length;
  const tableSize = snapshot.tableSize ?? dealt;
  const bb = bigBlindFromSnapshot(snapshot);

  // Уровень блайндов (стадия турнира) — если парсер его вытащил из шапки HH.
  if (snapshot.level != null) lines.push(`Уровень блайндов турнира: ${snapshot.level}.`);

  // Сколько игроков живо ПО УЛИЦАМ — не только «на флоп пошло N»: на тёрне/ривере число могло
  // упасть, и от него зависит агрессия воздухом (мультивей режет блеф). Считаем по фолдам ДО
  // начала каждой улицы. Правило 1: «остался один на один» модель раньше выводила из списка сама.
  const STREET_IDX: Record<Street, number> = { PREFLOP: 0, FLOP: 1, TURN: 2, RIVER: 3 };
  const liveAt = (street: Street) =>
    dealt -
    new Set(
      snapshot.actions.filter((a) => a.action === "FOLD" && STREET_IDX[a.street] < STREET_IDX[street]).map((a) => a.actor),
    ).size;
  const liveParts: string[] = [];
  if (snapshot.board.length >= 3) liveParts.push(`на флоп пошло ${liveAt("FLOP")}`);
  if (snapshot.board.length >= 4) liveParts.push(`на тёрн осталось ${liveAt("TURN")}`);
  if (snapshot.board.length >= 5) liveParts.push(`на ривер ${liveAt("RIVER")}`);
  lines.push(
    `За столом ${tableSize} мест, в раздаче ${dealt} игрок(ов)${liveParts.length ? `, ${liveParts.join(", ")}` : ""}.`,
  );

  // Мёртвые деньги (анте+блайнды) и запас стека в кругах (M-фактор) — контекст пуш-фолда на
  // коротком стеке. Мёртвые деньги = сумма всех форсов (их забираешь без вскрытия, если все
  // сбросят). Запас = стек / стоимость круга (SB+BB+сумма анте) — сколько кругов проживёшь без
  // игры. Слово-термин «M-фактор» модели НЕ показываем (2026-07-15: она копировала его игроку,
  // а любитель термин не знает) — даём число+смысл человеческими словами. Всё из снимка.
  if (bb) {
    const forcedOf = (act: string) =>
      snapshot.actions.filter((a) => a.action === act).reduce((s, a) => s + (a.amount ?? 0), 0);
    const anteTotal = forcedOf("POST_ANTE");
    const sbTotal = forcedOf("POST_SB");
    const bbTotal = forcedOf("POST_BB");
    const deadChips = anteTotal + sbTotal + bbTotal;
    if (deadChips > 0)
      lines.push(
        `Форсы (анте+блайнды) в банке на старте: ${round1(deadChips / bb)} BB - банк, за который идёт борьба до карт (свой блайнд/анте из него - уже твой вклад, не «выигрыш»).`,
      );
    const orbitCost = sbTotal + bbTotal + anteTotal;
    const heroChips = heroSeat?.startingStack ?? null;
    if (heroChips !== null && orbitCost > 0) {
      const mFactor = heroChips / orbitCost;
      lines.push(
        `Запас стека Hero: хватает на ${round1(mFactor)} кругов без игры (стек / стоимость круга SB+BB+анте) - столько проживёшь, ничего не разыгрывая. Игроку передавай это понятными словами - «в стеке всего пара кругов», «стек тает», - а не служебным термином.`,
      );
      // Зона стека (Харрингтон) + давление ICM - детерминированно из M, чтобы тренер не оценивал
      // стадию «на глаз». Точную стадию (сколько осталось, близко ли деньги) HH не показывает.
      const zone =
        mFactor >= 20
          ? "зелёная - глубоко, полная свобода игры постфлоп"
          : mFactor >= 10
            ? "жёлтая - сужай диапазоны, чаще забирай банк первым входом"
            : mFactor >= 6
              ? "оранжевая - включается пуш-фолд: ищи спот пушнуть первым, доигровки постфлоп мало"
              : mFactor >= 1
                ? "красная - чистый пуш-фолд, олл-ин-или-фолд по диапазону"
                : "мёртвая - пуш любой разумной рукой, ждать нечего";
      lines.push(
        `Зона стека: ${zone}. Чем короче стек, тем важнее ВЫЖИВАНИЕ (давление ICM): у призовых и на пузыре маргинальные коллы дороже, чем по чистым фишкам. Но стадию турнира (сколько игроков осталось, близко ли деньги) HH-файл НЕ показывает - её не выдумывай, суди по стеку и по тому, что скажет игрок.`,
      );
    }
  }

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

  // Банк, эффективный остаток и SPR в точке первого решения Hero — ПО ВСЕМ улицам, против
  // ФАКТИЧЕСКИ поставившего соперника (не крупнейшего за столом). В мультивее это важно: шипует
  // коротыш, а SPR против крупнейшего (старый f.sprFlop) показывал бы «глубоко, играем контроль»,
  // когда против поставившего SPR≈1 = стек-офф (кандидат 2 свипа). «Замазанность»/глубину на
  // поздних улицах модель раньше считала сама. tableStateUpTo, чтобы не плодить цикл импорта
  // facts↔alternatives. Всё в BB (правило 1). f.sprFlop (против крупнейшего) остаётся полем для
  // decision-weight, но в текст идёт эта, поуличная и против поставившего, версия.
  for (const street of ["FLOP", "TURN", "RIVER"] as const) {
    if (snapshot.board.length < (street === "FLOP" ? 3 : street === "TURN" ? 4 : 5)) continue;
    const idx = snapshot.actions.findIndex((a) => a.actor === "Hero" && a.street === street);
    if (idx < 0) continue;
    // Состояние ДО решения Hero (idx-1), а не включая его ставку: иначе банк/SPR «в точке решения»
    // считались ПОСЛЕ собственной ставки Hero (SPR занижен, конфликт с nextStreetSpr и с «60% банка»,
    // ревью согласованности). Если действие idx-1 на ДРУГОЙ улице (Hero первый на текущей) — ставок
    // на ней ещё не было, curBet=0.
    const st = tableStateUpTo(snapshot, idx - 1);
    if (st.potSoFar <= 0) continue;
    const priorSameStreet = idx > 0 && snapshot.actions[idx - 1].street === street;
    const hero = st.seats.find((s) => s.isHero);
    const heroRem = hero?.remainingStack ?? 0;
    const opps = st.seats.filter((s) => !s.isHero && !s.folded);
    const curBet = priorSameStreet ? Math.max(...opps.map((s) => s.streetBet), 0) : 0;
    const bettor = priorSameStreet ? (opps.find((s) => s.streetBet === curBet && curBet > 0) ?? null) : null;
    const effRem = bettor ? Math.min(heroRem, bettor.remainingStack) : heroRem;
    const spr = round1(effRem / st.potSoFar);
    const potBb = bb ? round1(st.potSoFar / bb) : null;
    const remBb = bb ? round1(effRem / bb) : null;
    // Банк/остаток в BB только если знаем блайнд (иначе не печатаем «null BB»). SPR безразмерен.
    const potPart = potBb !== null ? `банк ${potBb} BB, ` : "";
    const remPart = remBb !== null ? `эффективный остаток ${remBb} BB, ` : "";
    lines.push(`На ${STREET_RU[street]} в точке твоего решения: ${potPart}${remPart}SPR ${spr}.`);
  }

  // Дро Hero ПО УЛИЦАМ (флоп/тёрн) — считаем на каждой, т.к. на полном борде (ривер)
  // дро уже нет, и иначе флоп/тёрн-дро вообще не попало бы в факты (так модель его
  // выдумывала или ставила не на ту улицу). Ривер пропускаем — там дро не бывает.
  // Ауты/эквити — точным перебором (draws.ts): сырое и чистое (грязные ауты помечены),
  // бэкдоры учтены. Эквити к риверу (на флопе — 2 карты, на тёрне — 1).
  let drawSeen = false;
  let prevDraw = "";
  for (const street of ["FLOP", "TURN"] as const) {
    // Улицы после фолда Hero — призрак (см. heroSawStreet): дро у руки, которой он не играл.
    if (!heroSawStreet(snapshot, street)) continue;
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
    // Улицы после фолда Hero — призрак (см. heroSawStreet): факт про руку, которой он не играл.
    if (!heroSawStreet(snapshot, street)) continue;
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
    let line = `Ауты Hero на улучшение на ${STREET_RU[street]} (перебор колоды, следующая карта; любое повышение руки): всего ${io.outsRaw}, из них чистых ${io.outsClean}. Разбивка: ${parts.join(", ")}. Число аутов бери ОТСЮДА, своё не считай; «чистых» ровно ${io.outsClean} — грязные ауты (помеченные «N грязных») чистыми НЕ называй и к чистым НЕ приплюсовывай.`;
    if (io.taintReasons.length > 0)
      line += ` Грязные ауты ${io.taintReasons.join("; ")} — усиливают руку номинально, но обычно оставляют позади; игроку опирайся на ЧИСТЫЕ.`;
    lines.push(line);
  }

  // Готовая рука Hero по улицам — состав комбинации считает парсер (правило 1), чтобы
  // модель не выдумывала «пару, которой нет» и не путала фулл с двумя парами.
  //
  // ⚠️2026-07-16: дедуп по ярлыку СНЯТ. Раньше строка печаталась, только когда рука МЕНЯЛАСЬ:
  // собрал две пары на флопе — на тёрне и ривере строки не было вовсе, и модель обязана была
  // переносить факт сама. Аудит показал, чем это кончается: «две пары» превращались в «трипс» и
  // «одну пару», каре — в «фулл». Теперь рука печатается на КАЖДОЙ улице с бордом: +2 строки на
  // раздачу (~20 токенов) против целого класса грубых ошибок. Остальные признаки (натсовость,
  // уязвимость, кикер) дедуп сохраняют — они дополняют ярлык, а не заменяют его.
  let prevMade = "";
  let prevNut = "";
  let prevVuln = "";
  let prevKicker = "";
  let prevOdds = "";
  let prevBlocker = "";
  for (const street of ["FLOP", "TURN", "RIVER"] as const) {
    // Улицы после фолда Hero — призрак: он их не играл (см. heroSawStreet). Раньше здесь
    // рождалось «трипс троек на флопе» у сброшенной T3o → модель достраивала «карманную пару».
    if (!heroSawStreet(snapshot, street)) continue;
    const b = boardUpToStreet(snapshot.board, street);
    if (b.length < 3) continue;
    const mh = heroMadeHand(snapshot.heroCards, b);
    if (!mh) continue;
    // Ярлык готовой руки — на КАЖДОЙ улице (см. комментарий выше про снятый дедуп). Категорию и
    // её место в иерархии даёт парсер: модель путает именно «что сильнее», а не состав руки.
    // prevMade оставлен: по нему видно, изменилась ли рука с прошлой улицы.
    // Формулировка намеренно про КАТЕГОРИЮ, а не «называй руку так»: описание mh.ru бывает
    // тоньше ярлыка («пара лежит на борде — своей пары нет»), и приказ «называй ровно так»
    // толкнул бы модель сказать игроку «у тебя пара». Запрещаем именно переклассификацию —
    // ровно ту ошибку, что нашёл аудит (каре→«фулл», две пары→«трипс»).
    const cat = madeHandCategoryRu(mh.category);
    const catNote = cat ? ` Категория комбинации — ${cat.ru} (${cat.place}-я сверху из 9), другой комбинацией её не называй.` : "";
    lines.push(`Готовая рука Hero на ${STREET_RU[street]}: ${mh.ru}.${catNote}`);
    prevMade = mh.ru;
    // Полнодечная перепись — СНАЧАЛА: она единственная знает, бьёт ли руку хоть что-нибудь, и
    // судит натсовость ниже. Раньше nut считался раньше и мерил старшинство ВНУТРИ категории —
    // отсюда «Твой стрит НАТСОВЫЙ» рядом с «тебя бьют 60» в одном и том же снимке (регресс #8).
    const odds = fullDeckOdds(snapshot.heroCards, b);
    // Натсовость флеша/стрита (свип): старшинство считает парсер, не модель «на глаз».
    const nut = madeHandNutStatus(snapshot.heroCards, b, odds);
    if (nut && nut !== prevNut) {
      prevNut = nut;
      lines.push(nut);
    }
    // Суб-бакет сильной руки (сет топ/не-топ, две пары уязвимы) — структурная сила, не ярлык «велью».
    const vuln = madeHandVulnerability(snapshot.heroCards, b);
    if (vuln && vuln !== prevVuln) {
      prevVuln = vuln;
      lines.push(vuln);
    }
    // Кикер-доминирование своей пары (свип): 72 на 7K4 - двойка бита любым 7x. Считает парсер,
    // чтобы модель не звала доминируемую пару «пригодной».
    const kicker = madeHandKicker(snapshot.heroCards, b);
    if (kicker && kicker !== prevKicker) {
      prevKicker = kicker;
      lines.push(kicker);
    }
    // Постфлоп-блокер к натс-флешу соперника (свип): держишь старшую карту масти без своего флеша.
    const blocker = nutFlushBlocker(snapshot.heroCards, b);
    if (blocker && blocker !== prevBlocker) {
      prevBlocker = blocker;
      lines.push(blocker);
    }
    // Печать переписи (сама она посчитана выше — до натсовости): сколько ВООБЩЕ возможных раскладов
    // соперника бьют готовую руку Hero — структурный якорь уязвимости, не диапазон конкретного
    // соперника. Обобщает vuln/кикер на ЛЮБУЮ руку (включая одну пару/воздух, которым иначе нет ни
    // одного числа силы).
    if (odds) {
      const oddsKey = `${odds.losesTo}|${odds.total}|${odds.beats}`;
      if (oddsKey !== prevOdds) {
        prevOdds = oddsKey;
        const brk = odds.losesByCategory.length
          ? ` (из них ${odds.losesByCategory.map((c) => `${c.count} ${c.category}`).join(", ")})`
          : "";
        let s = `Расклады против твоей руки на ${STREET_RU[street]} (перебор всей колоды - НЕ диапазон конкретного соперника, а сколько способов обойти тебя вообще существует): тебя бьют ${odds.losesTo} из ${odds.total} возможных комбо${brk}; ты впереди ${odds.beats}.`;
        if (street === "RIVER" && odds.beats > 0 && !odds.heroBeatsValue)
          s += ` Всё, что ты бьёшь - воздух соперника (ни одной его готовой руки ты не бьёшь): по сути блеф-кэтчер.`;
        lines.push(s);
      }
    }
  }

  // Ярлык фактически выпавшей карты тёрна/ривера (свип): усилила/скэр/дро-сгорело — чтобы модель
  // не сверяла флоповые множества с реальной картой «на глаз». Блэнк не печатаем (не шумим).
  for (const [ruName, cardIdx] of [["тёрна", 3] as const, ["ривера", 4] as const]) {
    if (snapshot.board.length <= cardIdx) continue;
    const impact = fallenCardImpact(snapshot.heroCards, snapshot.board.slice(0, cardIdx), snapshot.board[cardIdx]);
    if (impact && impact.kind !== "blank") lines.push(`Карта ${ruName} для тебя: ${impact.detail}.`);
  }

  // Оверкарты к паре Hero и scare-карты следующей улицы (свип) — угрозы, которые модель считала
  // на глаз. Только флоп/тёрн (на ривере следующей карты нет). По улицам, без повторов.
  let prevThreat = "";
  for (const street of ["FLOP", "TURN"] as const) {
    // Улицы после фолда Hero — призрак (см. heroSawStreet): факт про руку, которой он не играл.
    if (!heroSawStreet(snapshot, street)) continue;
    const b = boardUpToStreet(snapshot.board, street);
    if (b.length < 3) continue;
    const parts: string[] = [];
    const over = overcardsToPair(snapshot.heroCards, b);
    if (over)
      parts.push(`оверкарт к твоей паре ${over.count} - приход старшей карты (не твоего кикера) даёт сопернику пару выше`);
    const scare = scareCards(snapshot.heroCards, b);
    if (scare)
      parts.push(`страшных карт следующей улицы против твоей руки ${scare.count} из ${scare.total} (дают на доске флеш/стрит/оверкарту)`);
    if (parts.length === 0) continue;
    const line = parts.join("; ");
    if (line === prevThreat) continue;
    prevThreat = line;
    lines.push(`Угрозы на ${STREET_RU[street]}: ${line}.`);
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
    // Велью-рамка когда у Hero готовая рука (пара+), иначе блеф-рамка. foldsNeededPct — ДОЛЯ
    // ДИАПАЗОНА соперника, а не «частота раз» (правка Артёма 2026-07-10). Раньше велью-ставка (сет/
    // две пары) звалась ТОЛЬКО «как блеф окупается» — велью↔блеф перевёртыш (ревью согласованности).
    let line = b.madeValue
      ? `Ставка Hero (${b.street}): ≈${b.sizePctOfPot}% банка (${SIZE_CLASS_RU[b.sizeClass]}) на ВЕЛЬЮ (готовая рука пара+); фолд-эквити как бонус - если сбросится ≥${b.foldsNeededPct}% диапазона, забираешь без вскрытия.`
      : `Ставка Hero (${b.street}): ≈${b.sizePctOfPot}% банка (${SIZE_CLASS_RU[b.sizeClass]}); готовой руки нет - как блеф окупается, если сбросится ≥${b.foldsNeededPct}% диапазона соперника.`;
    const potIfCalledStr = bb ? `${round1(b.potIfCalled / bb)} BB` : `${b.potIfCalled}`;
    // Эквити ставки Hero считается к РИВЕРУ (2 карты) на флопе и к след. карте (1) на тёрне — метка
    // должна совпадать с горизонтом (ревью согласованности: на флопе было ложно «к след. карте»).
    const betHorizon = b.street === "FLOP" ? "к риверу" : "к след. карте";
    if (b.drawEquityPct !== undefined)
      line += b.madeValue
        ? ` Плюс дро (эквити ≈${b.drawEquityPct}% ${betHorizon}) - подстраховка и добор; при колле ОДНОГО соперника банк станет ${potIfCalledStr}.`
        : ` Дро (эквити ≈${b.drawEquityPct}% ${betHorizon}) делает это полу-блефом: при колле ОДНОГО соперника банк станет ${potIfCalledStr} (потенциал добора; заколлируют двое — банк больше).`;
    // Геометрия второго барреля (свип): коммитит ли ставка стек. SPR «на ВХОДЕ» в след. улицу (до
    // ставок на ней) — не путать с поуличным «в точке решения» (после ставок), ревью согласованности.
    if (b.nextStreetSpr !== undefined) {
      line += b.commitsStack
        ? ` Если заколлируют, на входе в следующую улицу (до ставок) SPR ≈${b.nextStreetSpr} - ставка уже коммитит стек (следующая улица = олл-ин-или-фолд, план нужен заранее).`
        : ` Если заколлируют, на входе в следующую улицу (до ставок) SPR ≈${b.nextStreetSpr} - место для манёвра ещё остаётся.`;
    }
    lines.push(line);
  }
  for (const h of f.heroFacing) {
    let line = `Решение Hero на ${h.street}: доложить ${h.toCall} для колла; прибыльно при эквити от ≈${h.equityToCallPct}% (пот-оддс).`;
    if (h.madeValue) {
      // Готовая рука пара+: оценка колла — по силе руки против диапазона, дро (если есть) лишь апсайд.
      // НЕ гнать «слабое дро, обратные оддсы» — это перевёртыш для руки, которая часто уже впереди.
      line += h.drawEquityPct !== undefined
        ? ` У Hero уже готовая рука (пара+) плюс дро сверху (≈${h.drawEquityPct}% к след. карте) - оценивай по силе руки против его диапазона, дро это апсайд, а не основание колла.`
        : ` У Hero готовая рука (пара+) - оценивай колл по силе руки против диапазона соперника, не только по пот-оддсам.`;
    } else if (h.drawEquityPct !== undefined) {
      if (h.impliedUnreachable)
        line += ` У Hero голое дро (эквити ≈${h.drawEquityPct}% к след. карте) — прямых пот-оддсов не хватает, а добрать недостающее нечем (остаток мал): по эквити это фолд.`;
      else if (h.impliedExtraNeeded !== undefined)
        line += ` У Hero голое дро (эквити ≈${h.drawEquityPct}% к след. карте) — прямых пот-оддсов не хватает: колл окупится, только если при попадании доберёшь ещё ≥${h.impliedExtraNeeded} на следующих улицах (обратные оддсы).`;
      else line += ` У Hero голое дро (эквити ≈${h.drawEquityPct}% к след. карте) — прямых пот-оддсов уже достаточно для колла.`;
    }
    // Замазанность (свип): колл-в-олл-ин или SPR<1 после колла — числа парсера, не «на глаз».
    if (h.heroAllInOnCall) {
      line += ` Колл ставит тебя в олл-ин (весь остаток) — дальше улиц нет, доигровки не будет.`;
    } else if (h.potCommitted) {
      line += ` Ты уже вложил ≈${h.committedBeforePct}% стека; после колла останется меньше, чем в банке (SPR<1) — близок к замазанности. Но решай по эквити, а не «раз уж вложил».`;
    }
    // Доступные действия в узле (против инверсий «надо было прочекать», когда перед Hero ставка):
    // раз есть toCall, значит кто-то поставил → чек тут невозможен, только фолд/колл/рейз.
    line += ` В этой точке перед тобой ставка - варианты только фолд, колл или рейз/олл-ин; чек тут невозможен, не советуй «прочекать».`;
    lines.push(line);
  }
  // Геометрия префлоп-агрессии (свип): мёртвые деньги + break-even фолд-эквити числом.
  if (f.preflopAgg) {
    const p = f.preflopAgg;
    lines.push(
      `Твой префлоп-${p.kind}: рискуешь ${p.riskBb} BB, в банке до тебя ${p.deadMoneyBb} BB (блайнды/анте/лимпы; свой блайнд из них ты возвращаешь, а не выигрываешь). Чтобы рейз окупился одними фолдами (фолд-эквити), соперникам надо сбрасывать ≥${p.foldsNeededPct}% - если коллируют, дальше решает игра на борде.`,
    );
  }

  // Hero уже вложил весь стек (регресс #43, 17.07): после своего олл-ина игрок из раздачи ВЫШЕЛ —
  // решений у него больше нет. Тренер этого не понимал: на ATo, где Hero ре-пушнул 23.4 BB и SB
  // ответил олл-ином поверх, разбор советовал «фолд — дисциплинированное решение, сохраняющее
  // стек». Стек к тому моменту весь в банке; фолда в этой точке физически не существует.
  // Факт нужен именно детерминированный: сообразить «после олл-ина решать нечего» модель обязана
  // была сама — и не сообразила, как и с «натсом» (см. made-hand.ts).
  const heroShove = snapshot.actions.find((a) => a.actor === "Hero" && a.action === "ALL_IN");
  if (heroShove) {
    // ⚠️НЕ писать «весь стек в банке»: при покрытии коротышей излишек возвращается непокрытым
    // (это точно считает renderAllInGeometry — «17.7 BB возвращается»). Прежняя формулировка
    // ПРОТИВОРЕЧИЛА геометрии и врала (Артём поймал: осталось ~18 BB рабочих). Оставляем только
    // истинное: после олл-ина решений в этой раздаче больше нет.
    lines.push(
      `Ты пошёл олл-ином на ${STREET_RU[heroShove.street]} - после этого решений у тебя в ЭТОЙ раздаче больше нет: ни фолда, ни колла, ни «сохранить стек» после олл-ина не существует, что бы соперники ни делали дальше. Разбирай только те решения, которые были ДО твоего олл-ина; не советуй сбросить или заколлировать после него. (Сколько стека реально под риском и что возвращается — в строке про геометрию ре-пуша, если она есть.)`,
    );
  }

  if (lines.length === 0) return "";
  return ["Числа от парсера (используй как есть; игроку объясняй простыми словами, без терминов):", ...lines].join("\n");
}

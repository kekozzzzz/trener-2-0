import type { Street, TableAction, TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { equityVsHandsPreflop, equityVsHandPreflop } from "./cooler";
import { boardUpToStreet, tableStateUpTo } from "./table-state";
import { lastAggressionIndex } from "./aggression";
import { stageHint, SHORT_TABLE_SEATS } from "@/config/poker/tournament-stage";
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
  // Сами фишки: сколько поставлено и КАКОЙ банк был ДО ставки. Без этой пары модель берёт банк из
  // соседней строки «в точке твоего решения» (он уже ВКЛЮЧАЕТ ставку и коллы) и выдаёт игроку
  // «в банке 23.4 BB он поставил 5.9 BB» — половина банка превращается в четверть (регресс 07.08).
  amount: number;
  potBefore: number;
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
  // Сколько СОПЕРНИКОВ уже в банке к моменту решения Hero: поддержали текущую ставку или сидят
  // ва-банк на меньшую сумму. ≥2 — решение мультивей, колл обязан обойти столько диапазонов сразу.
  oppsInPot?: number;
  // Готовая рука Hero на этой улице — СЛАБАЯ пара (ниже двух карт борда): карманка под двумя
  // оверкартами, третья пара. Без этого признака madeValue сплющивал топ-пару и 66 под K и T в
  // одинаковое «пара+» (регресс 07.08, см. рендер ниже).
  madeWeak?: boolean;
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
  // Сколько соперников должны сбросить, чтобы атака сработала СРАЗУ. Порог foldsNeededPct посчитан
  // как доля ОДНОГО диапазона; когда живых соперников двое и больше, сбросить обязаны ВСЕ, и
  // «≥40% диапазона соперника» перестаёт быть тем порогом, который модель читает (регресс 07.08).
  oppsToFold?: number;
  // Готовая рука Hero — СЛАБАЯ пара (ниже двух карт борда). Без этого признака madeValue звал
  // «ставкой на ВЕЛЬЮ» карманную шестёрку под K и T, и модель хвалила добор там, где ставка —
  // чистый блеф, который коллирует всё, что Hero бьёт (аудит 07.08; у колла это уже починено).
  madeWeak?: boolean;
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
  oppsToFold: number,
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
    oppsToFold,
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
  if (mh && mh.strength !== "AIR" && mh.category !== "HIGH") {
    fact.madeValue = true;
    fact.madeWeak = mh.strength === "WEAK_PAIR";
  }
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

  // Сколько соперников ещё живы и МОГУТ сбросить в ответ на ставку Hero. Порог фолд-эквити
  // («сбросится ≥X% диапазона») посчитан для ОДНОГО — против двоих и больше сбросить обязаны все,
  // и тот же X перестаёт означать то, что читает модель. Ва-банк исключаем: сбросить он не может.
  const liveOpponents = () =>
    snapshot.seats.filter(
      (s) => s.label !== "Hero" && !folded.has(s.label) && (startingStack.get(s.label) ?? 0) - (invested.get(s.label) ?? 0) > 0,
    ).length;

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
          heroBets.push(heroBetFact(snapshot, street, amt, pot, g.heroRemAfterBet, g.effOppRem, g.oppCall, liveOpponents()));
        } else if (street !== "PREFLOP" && pot > 0) {
          const size = pct(amt / pot);
          bets.push({ street, actor: a.actor, sizePctOfPot: size, sizeClass: sizeClass(size), amount: amt, potBefore: pot });
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
            heroBets.push(heroBetFact(snapshot, street, delta, pot, g.heroRemAfterBet, g.effOppRem, g.oppCall, liveOpponents()));
          } else if (street !== "PREFLOP" && pot > 0) {
            const size = pct(delta / pot);
            bets.push({ street, actor: a.actor, sizePctOfPot: size, sizeClass: sizeClass(size), amount: delta, potBefore: pot });
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
        if (mhFacing && mhFacing.strength !== "AIR" && mhFacing.category !== "HIGH") {
          fact.madeValue = true;
          fact.madeWeak = mhFacing.strength === "WEAK_PAIR";
        }
        // Сколько соперников УЖЕ в банке к этому решению (регресс 07.08, 66 на T♥K♣5♥: BB поставил,
        // CO заколлировал ДО хода Hero, а вердикт рассуждал «против широкого диапазона BB», то есть
        // как в хедз-апе, и назвал верный фолд «излишне осторожным»). Порядок хода парсер отдавал
        // верно (action-order.ts), но модель его не ПРИМЕНЯЛА — значит нужен факт в самой точке
        // решения, а не рядом. Считаем: не сброшен, и либо поддержал текущую ставку, либо ва-банк на
        // меньшую сумму (его всё равно надо обойти). Блайнды сюда не попадают: их вклад < currentBet.
        fact.oppsInPot = [...streetCommitted.entries()].filter(([label, c]) => {
          if (label === "Hero" || folded.has(label)) return false;
          if (c >= currentBet) return true;
          const start = startingStack.get(label) ?? 0;
          return start > 0 && (invested.get(label) ?? 0) >= start;
        }).length;
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

  // Флеш-угроза — независимо от спаренности/трипса (доска может быть и спарена, и трёхмастная
  // одновременно). Не предупреждаем, если это масть самого Hero (тогда это его аут, не угроза
  // против него) — та же граница, что и в scareCards/fallenCardImpact (heroSuitCount < 2).
  const suitCount = new Map<string, number>();
  for (const c of b) suitCount.set(c.suit, (suitCount.get(c.suit) ?? 0) + 1);
  const flushSuitEntry = [...suitCount.entries()].find(([, n]) => n >= 3);
  if (flushSuitEntry) {
    const [suit, n] = flushSuitEntry;
    const hero = heroCards.map(parseCard).filter((c): c is Card => c !== null);
    const heroSuitCount = hero.filter((c) => c.suit === suit).length;
    if (heroSuitCount < 2) {
      const suitNameRu: Record<string, string> = { s: "пик", h: "черв", d: "бубен", c: "треф" };
      const suitName = suitNameRu[suit] ?? suit;
      out.push(
        `Опасность борда: на доске ${n} карты одной масти (${suitName}) - у любого соперника с двумя картами этой масти уже готовый флеш. Внезапная крупная ставка на такой доске после пассивной игры (чек-чек-бет) - частый признак собравшегося флеша, не блефа. Не сбрасывай флеш со счетов при чтении диапазона только потому, что рука соперника "выглядела" слабой раньше.`,
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
  // Мультивей: попарные числа выше — НЕ ответ на вопрос «сколько у меня было». В банке на троих
  // выиграть надо у ОБОИХ сразу, и настоящее эквити ниже любого попарного, иногда вдвое. Раньше
  // печатались только попарные, и модель брала удобное («против CO 55% - ты был впереди»), выдавая
  // игроку прямо вредный вывод про его заход (аудит 08.08). Считаем настоящее число и ставим ПЕРВЫМ.
  const multi =
    shown.length >= 2 ? equityVsHandsPreflop(hero, shown.map((s) => s.shownCards!)) : null;
  const multiHead =
    multi !== null
      ? `Соперников на вскрытии ${shown.length}, и обойти надо ВСЕХ сразу: твоё настоящее эквити в этом банке ≈${multi}%. Именно это число описывает твой заход. Попарные ниже даны только чтобы видеть, кто конкретно тебя бил, — брать их как «сколько у меня было» НЕЛЬЗЯ, каждое из них выше настоящего. `
      : "";
  return `ТВОЁ ТОЧНОЕ ЭКВИТИ на момент олл-ина (ДО флопа, честный перебор — это то, что ты реально имел, когда РЕШАЛ, а не итог по борду): ${multiHead}${multi !== null ? "попарно — " : ""}${parts.join("; ")}. Суди СВОЁ решение по этим числам, а НЕ по результату: проиграл, будучи впереди или во флипе, — это дисперсия, а не ошибка; закинул стек, будучи далеко позади, — вопрос к самому заходу. «Хорошее эквити» тут выдумывать нельзя — вот оно, точное.`;
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

  // Заколлировал ли соперник ПОСЛЕДНЮЮ агрессию Hero — чтобы прямо сказать, что его колл был
  // коллом ГОТОВОЙ рукой. Регресс 18.07 (QTo, борд J6A88): тренер написал, что блеф заколлировали
  // «даже парой восьмёрок», хотя парсер передал «две пары (тузов и восьмёрок)». Смысл перевернулся —
  // вышло, будто коллировали мусором, хотя коллировала крепкая рука.
  // Последняя НАСТОЯЩАЯ ставка Hero. Все румы пишут колл-олл-ина тем же ALL_IN, что и пуш, поэтому
  // без сверки сумм КОЛЛ Hero принимался за его СТАВКУ и выходило «твою ставку заколлировали» там,
  // где Hero сам доложил (находка ревью 18.07). Критерий — общий для парсера, см. aggression.ts.
  const heroAggroIdx = lastAggressionIndex(snapshot, "Hero");
  // ⚠️Утверждать «заколлировал ИМЕННО с ЭТОЙ готовой рукой» можно ТОЛЬКО когда колл был на РИВЕРЕ:
  // mh считается по ПОЛНОМУ борду, а на ранней улице соперник мог заколлировать с ДРО, которое
  // собралось позже. Иначе получился бы ложный факт («заколлировал твой флоп-бет с флешем», хотя
  // флеша тогда не было) — тот же критический класс, что и выдуманное вскрытие.
  const calledHeroBet = (label: string) => {
    if (heroAggroIdx < 0 || board.length !== 5) return false;
    if (snapshot.actions[heroAggroIdx].street !== "RIVER") return false;
    // Если между ставкой Hero и коллом кто-то ПОДНЯЛ, соперник заколлировал уже чужой рейз, а не
    // ставку Hero — пометку вешать нельзя (вторая часть находки ревью).
    const after = snapshot.actions.slice(heroAggroIdx + 1);
    const raiseIdx = after.findIndex(
      (a) => a.actor !== "Hero" && (a.action === "BET" || a.action === "RAISE" || a.action === "ALL_IN"),
    );
    const window = raiseIdx >= 0 ? after.slice(0, raiseIdx) : after;
    // Колл ва-банк румы пишут как ALL_IN — засчитываем и его, иначе пометка терялась там, где
    // соперник коллировал ставку Hero последними фишками (аудит румов 19.07). Настоящий рейз-олл-ин
    // сюда не попадёт: он отсечён поиском чужой агрессии выше (raiseIdx).
    return window.some(
      (a) => a.actor === label && a.street === "RIVER" && (a.action === "CALL" || a.action === "ALL_IN"),
    );
  };

  const lines: string[] = [];
  for (const seat of snapshot.seats) {
    if (seat.label === "Hero" || !seat.shownCards || seat.shownCards.length !== 2) continue;
    const cards = seat.shownCards.join(" ");
    const code = handCode(seat.shownCards);
    // subject "opponent" — иначе описание чужой руки выходит во втором лице («своей пары У ТЕБЯ
    // нет») и читается как факт про Hero: обе руки становились слово-в-слово одинаковыми при
    // РАЗНОМ вердикте, кто старше (аудит румов 19.07).
    const mh = board.length >= 3 ? heroMadeHand(seat.shownCards, board, "opponent") : null;
    let line = mh
      ? `${seat.label} вскрыл ${cards}${code ? ` (${code})` : ""}: ${mh.ru}.`
      : `${seat.label} вскрыл ${cards}${code ? ` (${code})` : ""}.`;
    // Детерминированный итог вскрытия против руки Hero (кто старше). Строка про КОНКРЕТНОГО
    // соперника, поэтому мультивей-безопасна: против одного можно выиграть, другому проиграть.
    // «банк по этой руке ты не забрал» аккуратнее, чем «весь банк» — не врём про сайд-поты.
    // Руки перечислены ПАРАЛЛЕЛЬНО с явными метками «у соперника» / «у тебя», а не вложенно:
    // старое «твоя рука (<описание>) проиграла этой - <описание> старше» ставило три описания рук
    // в одно предложение, и модель склеивала хвост чужой комбинации со своей (регресс 18.07).
    if (heroVal && heroMh && mh) {
      const cmp = compareValues(heroVal, cardSetValue([...seat.shownCards, ...board]));
      const who =
        cmp < 0
          ? "старше рука СОПЕРНИКА - банк по этой руке ты не забрал"
          : cmp > 0
            ? "старше ТВОЯ рука - против неё ты выиграл вскрытие"
            : "руки РАВНЫ по силе - дележ банка";
      line += ` Сравнение на вскрытии: у соперника - ${mh.ru}; у тебя - ${heroMh.ru}; ${who}.`;
    }
    if (mh && calledHeroBet(seat.label))
      line += ` Твою последнюю ставку он заколлировал ИМЕННО с этой готовой рукой - это НЕ лёгкий колл слабой рукой и НЕ «колл мусором»: не ослабляй посчитанную комбинацию до «просто пары» или «просто туза».`;
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
      "Вскрытые карты соперников на шоудауне и их готовая комбинация (посчитал парсер - НЕ гадай «вероятно, сет/флеш», состав руки уже дан). Кто из рук старше на вскрытии - тоже посчитал парсер, не переопределяй это сам. Комбинацию соперника называй ЦЕЛИКОМ и не ОСЛАБЛЯЙ: если посчитаны две пары - нельзя писать «просто пара» или «просто туз», если посчитан сет - нельзя «пара». Ослабление переворачивает смысл раздачи (выходит «заколлировал мусором» вместо «заколлировал готовой рукой»). Ранги бери ТОЛЬКО из строк ниже, своих не добавляй:",
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
  // ⚠️Флеш/дро считаются ТВОИМИ только если ты реально держишь карты этой масти. Раньше суммировались
  // борд+рука без этой проверки, и четыре трефы НА БОРДЕ при 8♥7♥ давали «у ТЕБЯ было флеш-дро треф»
  // (Артём 19.07). Хуже того, ложная ветка вытесняла настоящее предупреждение, что флеш возможен
  // только у соперника, — и тренер советовал рейз «на велью» в доску из четырёх одномастных.
  let ownSuit: string | null = null;
  for (const s of suits) {
    if (heroN(s) === 0) continue;
    if (ownSuit === null || boardN(s) + heroN(s) > boardN(ownSuit) + heroN(ownSuit)) ownSuit = s;
  }
  const ownTotal = ownSuit ? boardN(ownSuit) + heroN(ownSuit) : 0;
  const ownRu = ownSuit ? SUIT_RU_GEN[ownSuit] ?? ownSuit : "";
  if (ownSuit && ownTotal >= 5)
    return `Флеш-угроза: у тебя СОБРАН флеш ${ownRu} (${heroN(ownSuit)} в руке + ${boardN(ownSuit)} на борде).`;
  // Дро считаем только пока есть будущая карта: на ривере (борд=5) 4 карты масти — это уже НЕ дро,
  // флеша нет (регресс #85: A7 бубны на ривере, 4 бубны без пятой — «натсового флеша» нет).
  if (ownSuit && ownTotal === 4 && board.length < 5)
    return `Флеш-угроза: у тебя ФЛЕШ-ДРО ${ownRu} (${heroN(ownSuit)} в руке + ${boardN(ownSuit)} на борде, не хватает одной карты) - но это ещё НЕ флеш.`;
  if (ownSuit && ownTotal === 4 && board.length === 5)
    return `Флеш-угроза: до ривера у тебя было флеш-дро ${ownRu} (${heroN(ownSuit)} в руке + ${boardN(ownSuit)} на борде), но пятая не пришла - флеша НЕТ, не пиши, что собрал флеш.`;
  // Своего флеша/дро нет. Угроза соперника — по масти с максимумом НА БОРДЕ (3+ = флеш возможен у него).
  let maxBoardSuit = "s";
  for (const s of suits) if (boardN(s) > boardN(maxBoardSuit)) maxBoardSuit = s;
  const maxBoardN = boardN(maxBoardSuit);
  if (maxBoardN < 3) {
    return `Флеш-угроза: на борде максимум ${maxBoardN} карты одной масти, у тебя тоже нет 4 одной масти - флеша и флеш-дро НЕТ ни у тебя, ни у соперника, не выдумывай флеш.`;
  }
  const maxRu = SUIT_RU_GEN[maxBoardSuit] ?? maxBoardSuit;
  // Четыре и больше одномастных НА БОРДЕ при отсутствии этой масти у Hero — самая опасная текстура:
  // сопернику достаточно ОДНОЙ карты масти. Отдельная громкая строка нужна потому, что тренер на
  // такой доске советовал рейз «на велью» стритом без трефы (Артём 19.07: «тут нет добора никогда»).
  if (maxBoardN >= 4)
    return `Флеш-угроза: на борде ${maxBoardN} карты масти ${maxRu}, а у тебя этой масти НЕТ. Сопернику хватит ОДНОЙ карты ${maxRu}, чтобы иметь готовый флеш, — он бьёт любую твою руку слабее фулл-хауса, включая стрит и сет. Значит рук СЛАБЕЕ твоей, готовых заплатить рейз, тут почти нет: добирать не с кого, а платить будут в основном флеши. Не советуй рейз «на велью» и не пиши, что ты впереди большей части его диапазона.`;
  return `Флеш-угроза: на борде ${maxBoardN} карт(ы) масти ${maxRu}, а у тебя этой масти нет - СВОЕГО флеша и флеш-дро у тебя НЕТ (флеш возможен только у соперника), не приписывай флеш или флеш-дро себе.`;
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
  // ⚠️Борд обрезаем последней улицей, которую Hero РЕАЛЬНО играл (аудит 07.08): раньше сводка
  // считалась по ИТОГОВОМУ борду, и сброшенной на префлопе руке A♥9♥ доставался «у тебя СОБРАН
  // флеш червей» — карты, которых Hero не видел. Тот же класс, что чинили heroSawStreet ниже.
  const lastSeen = (["RIVER", "TURN", "FLOP"] as const).find((st) => heroSawStreet(snapshot, st));
  const seenBoard = lastSeen ? boardUpToStreet(snapshot.board, lastSeen) : [];
  const flushLine = renderFlushSummary(snapshot.heroCards, seenBoard);
  if (flushLine) lines.push(flushLine);

  // Состав стола и позиция Hero — голые факты из снимка, чтобы модель не прикидывала «на глаз».
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (heroSeat) lines.push(`Позиция Hero за столом: ${heroSeat.positionName ?? heroSeat.position}.`);
  const dealt = snapshot.seats.length;
  const tableSize = snapshot.tableSize ?? dealt;
  const bb = bigBlindFromSnapshot(snapshot);

  // Уровень блайндов (стадия турнира) — если парсер его вытащил из шапки HH.
  if (snapshot.level != null) lines.push(`Уровень блайндов турнира: ${snapshot.level}.`);

  // Признак поздней стадии → тренер СПРАШИВАЕТ, а не утверждает (идея Артёма 20.07: «давай будем
  // спрашивать, если стол 3-4 макс и уровни большие»). Стадии в HH нет, выдумывать её нельзя, но
  // косвенные признаки есть — короткий стол, высокий уровень, короткий средний стек. Подробности
  // и калибровка порогов — в config/poker/tournament-stage.ts.
  {
    const seatCount = snapshot.seats.length;
    const avgStackBb =
      bb && seatCount > 0
        ? snapshot.seats.reduce((s, x) => s + (x.startingStack ?? 0), 0) / seatCount / bb
        : null;
    const hint = stageHint(snapshot.level, seatCount, avgStackBb);
    if (hint) {
      const why: string[] = [];
      if (seatCount <= SHORT_TABLE_SEATS) why.push(`за столом всего ${seatCount} игрока`);
      if (snapshot.level != null) why.push(`уровень блайндов ${snapshot.level}`);
      if (avgStackBb != null) why.push(`средний стек за столом ${round1(avgStackBb)} BB`);
      const what =
        hint === "FINAL_TABLE"
          ? "похоже на финальный или предфинальный стол"
          : "похоже на район призовых (пузырь или около него)";
      lines.push(
        `Признак поздней стадии турнира (${why.join(", ")}): ${what}. ⚠️Это ДОГАДКА по косвенным признакам, а НЕ факт: в HH-файле стадии нет, сколько игроков осталось в турнире и близко ли деньги — неизвестно. НЕ утверждай стадию и не строй на ней вердикт молча. Если стадия важна для этого решения (маргинальный колл, риск вылета, давление на коротких) — СПРОСИ игрока прямо: «это уже район денег / финалка?» — и дальше опирайся на его ответ. Если он скажет, что до денег далеко, — про ICM и «выживание» не рассуждай вовсе.`,
      );
    }
  }

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
  if (f.effectiveStackBb !== null && f.effectiveStackBb !== f.heroStackBb) {
    // Когда Hero заметно ПЕРЕКРЫВАЕТ эффективного соперника (после размена остаётся крупный стек),
    // эффективный стек мал ПОТОМУ ЧТО соперник короткий — а не потому что короткий Hero. Иначе модель
    // читала «15 BB» как стек Hero и советовала пуш-фолд/«дисциплинированный фолд на коротком стеке»
    // (Артём 18.07: у Hero 39.5 BB, олл-ин соперника 15 BB — тренер решил, что у Hero 15 BB).
    const behindBb = f.heroStackBb !== null ? round1(f.heroStackBb - f.effectiveStackBb) : 0;
    // ⚠️Хвост про «коллировать ли его олл-ин» дописываем ТОЛЬКО если олл-ин соперника реально был:
    // иначе на обычной раздаче без единого ва-банк выходило утверждение про несуществующий олл-ин
    // (аудит румов 19.07). Сама поправка «это стек короткого, а не твой» верна и без олл-ина.
    const someoneAllIn = snapshot.actions.some((a) => a.actor !== "Hero" && a.action === "ALL_IN");
    const coverNote =
      f.heroStackBb !== null && behindBb >= 8
        ? ` Это стек более КОРОТКОГО соперника, а НЕ твой: у тебя ${f.heroStackBb} BB, ты его ПЕРЕКРЫВАЕШЬ и после максимального размена оставляешь ~${behindBb} BB. Ты НЕ короткий стек — не рассуждай про «пуш-фолд/дисциплинированный фолд на коротком стеке»${someoneAllIn ? "; ты решаешь, коллировать ли его олл-ин, оставаясь с игровым стеком." : "."}`
        : "";
    lines.push(`Эффективный стек (против крупнейшего соперника): ${f.effectiveStackBb} BB.${coverNote}`);
  }

  // Текстура борда ПО УЛИЦАМ (как дро и готовая рука ниже). Одна текстура по
  // итоговому борду утекала в более ранние точки решения: модель писала «на тёрне
  // доска монотонная и спаренная», когда третью масть и пару приносил только ривер.
  let prevTexture = "";
  for (const street of ["FLOP", "TURN", "RIVER"] as const) {
    // Улицы после фолда Hero — призрак (см. heroSawStreet): он их не играл, а «доска стала
    // связанной на тёрне» модель приложит к решению, которого не было (аудит 07.08).
    if (!heroSawStreet(snapshot, street)) continue;
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
    // ⚠️Когда ставки на улице ещё не было, «эффективный остаток» — это НЕ стек самого Hero, а
    // минимум из его стека и стека крупнейшего ЖИВОГО соперника: разыграть больше него нельзя.
    // Раньше сюда шёл heroRem, и против коротыша SPR завышался кратно, споря с f.sprFlop
    // (аудит румов 19.07).
    const maxOppRem = opps.reduce((m, s) => Math.max(m, s.remainingStack), 0);
    const effRem = bettor
      ? Math.min(heroRem, bettor.remainingStack)
      : opps.length > 0
        ? Math.min(heroRem, maxOppRem)
        : heroRem;
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
    // ⚠️2026-08-08 (аудит): признаки руки печатались БЕЗ МЕТКИ УЛИЦЫ и с дедупом. Две беды разом.
    // Первая: строка «Твой стрит НАТСОВЫЙ», выданная на флопе, висела в снимке голой — модель
    // прикладывала её к риверу, где натс давно чужой. Вторая: если признак ПРОПАДАЛ (стал null —
    // дошла масть, борд спарился), новой строки не печаталось вовсе, и старая оставалась
    // последним словом парсера по теме. Теперь у каждой строки есть улица, а исчезновение
    // признака печатается ЯВНО — молчание тут читается как подтверждение.
    const feature = (
      label: string,
      value: string | null,
      prev: string,
    ): string => {
      if (value && value !== prev) lines.push(`[${STREET_RU[street]}] ${value}`);
      else if (!value && prev) lines.push(`[${STREET_RU[street]}] ${label} больше НЕ действует - то, что было сказано об этом на прошлой улице, к этой улице не относится.`);
      return value ?? "";
    };
    // Натсовость флеша/стрита (свип): старшинство считает парсер, не модель «на глаз».
    prevNut = feature("натсовость руки", madeHandNutStatus(snapshot.heroCards, b, odds), prevNut);
    // Суб-бакет сильной руки (сет топ/не-топ, две пары уязвимы) — структурная сила, не ярлык «велью».
    prevVuln = feature("оценка уязвимости", madeHandVulnerability(snapshot.heroCards, b), prevVuln);
    // Кикер-доминирование своей пары (свип): 72 на 7K4 - двойка бита любым 7x. Считает парсер,
    // чтобы модель не звала доминируемую пару «пригодной».
    prevKicker = feature("замечание про кикер", madeHandKicker(snapshot.heroCards, b), prevKicker);
    // Постфлоп-блокер к натс-флешу соперника (свип): держишь старшую карту масти без своего флеша.
    prevBlocker = feature("блокер к натс-флешу", nutFlushBlocker(snapshot.heroCards, b), prevBlocker);
    // Печать переписи (сама она посчитана выше — до натсовости): сколько ВООБЩЕ возможных раскладов
    // соперника бьют готовую руку Hero — структурный якорь уязвимости, не диапазон конкретного
    // соперника. Обобщает vuln/кикер на ЛЮБУЮ руку (включая одну пару/воздух, которым иначе нет ни
    // одного числа силы).
    if (odds) {
      const oddsKey = `${odds.losesTo}|${odds.total}|${odds.beats}|${odds.ties}`;
      if (oddsKey !== prevOdds) {
        prevOdds = oddsKey;
        const brk = odds.losesByCategory.length
          ? ` (из них ${odds.losesByCategory.map((c) => `${c.count} ${c.category}`).join(", ")})`
          : "";
        // ⚠️Ничьи считались, но в факт НЕ попадали: модель видела только «бьют» и «впереди» и
        // трактовала раздел банка как проигрыш («ты почти никогда не выигрываешь — только делишь,
        // значит колл невыгоден»). Раздел — это ПОЛОВИНА банка, а не ноль (Артём 19.07, K3o на
        // спаренной доске: 62 комбо делят). Называем их и говорим, как считать.
        const tiesPart =
          odds.ties > 0
            ? ` С ${odds.ties} комбо ты ДЕЛИШЬ банк - это не проигрыш: раздел возвращает половину, и в счёт эквити он идёт как ПОЛОВИНА выигрыша, а не как ноль.`
            : "";
        let s = `Расклады против твоей руки на ${STREET_RU[street]} (перебор всей колоды - НЕ диапазон конкретного соперника, а сколько способов обойти тебя вообще существует): тебя бьют ${odds.losesTo} из ${odds.total} возможных комбо${brk}; ты впереди ${odds.beats}.${tiesPart}`;
        if (street === "RIVER" && odds.beats > 0 && !odds.heroBeatsValue)
          s += ` Всё, что ты бьёшь - воздух соперника (ни одной его готовой руки ты не бьёшь): по сути блеф-кэтчер.`;
        lines.push(s);
      }
    }
  }

  // ⚠️КАКУЮ УЛИЦУ разбирать. Если последняя карта УЛУЧШИЛА руку Hero, то решения до неё принимались
  // рукой СЛАБЕЕ той, что дошла до вскрытия, — значит искать ошибку надо там, а не в финальном
  // действии. Тренер вешал вину на ривер-колл, хотя ривер Hero спас (Артём 19.07: K3o на K5Q85 —
  // пятёрка спарила доску и принесла РАЗДЕЛ банка; «по тёрну не нужно было коллировать или вообще
  // заходить»). Разбирать последнее действие, ставшее возможным благодаря улучшению, — не та улица.
  const seenStreets = (["FLOP", "TURN", "RIVER"] as const).filter(
    (s) => heroSawStreet(snapshot, s) && boardUpToStreet(snapshot.board, s).length >= 3,
  );
  if (seenStreets.length >= 2) {
    const last = seenStreets[seenStreets.length - 1];
    const prev = seenStreets[seenStreets.length - 2];
    const mhLast = heroMadeHand(snapshot.heroCards, boardUpToStreet(snapshot.board, last));
    const mhPrev = heroMadeHand(snapshot.heroCards, boardUpToStreet(snapshot.board, prev));
    const catLast = mhLast ? madeHandCategoryRu(mhLast.category) : null;
    const catPrev = mhPrev ? madeHandCategoryRu(mhPrev.category) : null;
    if (catLast && catPrev && catLast.place < catPrev.place) {
      lines.push(
        `Твоя рука УЛУЧШИЛАСЬ последней картой: на ${STREET_RU[prev]} у тебя было ${catPrev.ru}, на ${STREET_RU[last]} стало ${catLast.ru}. Значит решения, принятые ДО неё (колл на ${STREET_RU[prev]} и сам вход в раздачу), делались рукой СЛАБЕЕ той, что дошла до вскрытия: последняя карта тебя ВЫРУЧИЛА, а не подвела. Ища ошибку, проверь эти РАННИЕ решения, а не только последнее действие - назвать ошибкой финальный ход, который стал возможен благодаря улучшению, значит указать не на ту улицу.`,
      );
    }
  }

  // Ярлык фактически выпавшей карты тёрна/ривера (свип): усилила/скэр/дро-сгорело — чтобы модель
  // не сверяла флоповые множества с реальной картой «на глаз». Блэнк не печатаем (не шумим).
  for (const [ruName, cardIdx, street] of [
    ["тёрна", 3, "TURN"] as const,
    ["ривера", 4, "RIVER"] as const,
  ]) {
    if (snapshot.board.length <= cardIdx) continue;
    // ⚠️Улицы после фолда Hero — призрак (см. heroSawStreet): рука, которой он НЕ играл. Соседние
    // циклы (готовая рука, дро, ауты, угрозы) этот guard имеют, а здесь его не было — и сброшенной
    // на префлопе руке изъявительно сообщалось «Карта тёрна для тебя: подняла твою руку до
    // фулл-хауса» (аудит румов 19.07, воспроизведено на двух раздачах фикстуры GG).
    if (!heroSawStreet(snapshot, street)) continue;
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
    // Улицы после фолда Hero — призрак (см. heroSawStreet): «твой фулл-хаус НЕ старший» у руки,
    // которую он выбросил на префлопе, модель достраивает в несуществующую карманную пару.
    if (!heroSawStreet(snapshot, street)) continue;
    const b = boardUpToStreet(snapshot.board, street);
    if (b.length < 3) continue;
    const dangers = boardDangerFacts(snapshot.heroCards, b);
    if (dangers.length === 0) continue;
    const key = dangers.join("|");
    if (key === prevDanger) continue;
    prevDanger = key;
    for (const d of dangers) lines.push(d.replace("Опасность борда:", `Опасность борда на ${STREET_RU[street]}:`));
  }

  // Ставка соперника — с ПОЗИЦИЕЙ вместо служебного «Player N» (её модель и так обязана называть
  // игроку) и с самими фишками: «5.9 BB в банк 11.7 BB». Банк ДО ставки нигде больше не написан,
  // а соседняя строка «в точке твоего решения: банк 23.4 BB» его уже включает вместе с коллами —
  // модель их складывала и объявляла полбанка четвертью (регресс 07.08, разбор реальной раздачи).
  for (const b of f.bets) {
    const who = snapshot.seats.find((s) => s.label === b.actor);
    const pos = who ? (who.positionName ?? who.position) : b.actor;
    const inBb = (chips: number) => (bb ? ` = ${Math.round((chips / bb) * 10) / 10} BB` : "");
    lines.push(
      `Ставка соперника (${pos}, ${b.street}): ${b.amount}${inBb(b.amount)} в банк ${b.potBefore}${inBb(b.potBefore)} до неё - ≈${b.sizePctOfPot}% банка (${SIZE_CLASS_RU[b.sizeClass]}). Долю банка бери ОТСЮДА и не пересчитывай её от банка в точке решения: там банк уже включает и эту ставку, и коллы после неё.`,
    );
  }
  for (const b of f.heroBets) {
    // foldsNeededPct — ДОЛЯ ДИАПАЗОНА соперника, которая должна сброситься, а НЕ «частота
    // раз» (правка Артёма 2026-07-10, синхронизирована с цитатой порога в COACH_FRAMEWORK).
    // Велью-рамка когда у Hero готовая рука (пара+), иначе блеф-рамка. foldsNeededPct — ДОЛЯ
    // ДИАПАЗОНА соперника, а не «частота раз» (правка Артёма 2026-07-10). Раньше велью-ставка (сет/
    // две пары) звалась ТОЛЬКО «как блеф окупается» — велью↔блеф перевёртыш (ревью согласованности).
    // Порог фолд-эквити посчитан для ОДНОГО соперника. Когда живых двое и больше, сбросить обязаны
    // ВСЕ — и та же цифра начинает означать совсем другое (та же дыра, что у колла мультивей:
    // «диапазон соперника» в единственном числе там, где диапазонов несколько).
    const many = (b.oppsToFold ?? 1) >= 2;
    const whose = many ? `диапазона КАЖДОГО из ${b.oppsToFold} соперников` : "диапазона соперника";
    // ⚠️Слабая пара — НЕ велью. «Пара+» одинаково накрывала топ-пару и карманную шестёрку под K и T,
    // и ставка вторым случаем подписывалась «на ВЕЛЬЮ»: модель хвалила добор там, где ставку
    // коллирует всё, что Hero бьёт. Велью-рамку даём только руке, которая реально впереди коллов.
    let line = b.madeValue && !b.madeWeak
      ? `Ставка Hero (${b.street}): ≈${b.sizePctOfPot}% банка (${SIZE_CLASS_RU[b.sizeClass]}) на ВЕЛЬЮ (готовая рука пара+); фолд-эквити как бонус - если сбросится ≥${b.foldsNeededPct}% ${whose}, забираешь без вскрытия.`
      : b.madeWeak
        ? `Ставка Hero (${b.street}): ≈${b.sizePctOfPot}% банка (${SIZE_CLASS_RU[b.sizeClass]}); готовая рука есть, но пара СЛАБАЯ (ниже двух карт борда) - это НЕ ставка на велью: коллируют её в основном руки, которые тебя уже бьют, а сбрасывают те, что и так позади. Окупается она как блеф - если сбросится ≥${b.foldsNeededPct}% ${whose}.`
        : `Ставка Hero (${b.street}): ≈${b.sizePctOfPot}% банка (${SIZE_CLASS_RU[b.sizeClass]}); готовой руки нет - как блеф окупается, если сбросится ≥${b.foldsNeededPct}% ${whose}.`;
    if (many)
      line += ` ⚠️Ставка идёт в ${b.oppsToFold} соперников: сбросить должны ВСЕ до одного, поэтому забрать банк сразу тут заметно труднее, чем говорит порог ≥${b.foldsNeededPct}% для одного. Блеф в мультивей-банк по умолчанию слабее - чем больше живых рук, тем выше шанс, что хоть одна попала в борд. Не оценивай эту ставку как ставку против одного соперника.`;
    // Сколько улиц соперники УЖЕ оплатили до этой ставки. Регресс 18.07 (Артём поймал, QTo на
    // борде J6A88): тренер отверг блеф-цели игрока доводом «он вряд ли выбросит KQ, KJ, десятки» —
    // а KQ на тузовой доске это король-хай, он сбрасывается ВСЕГДА. Настоящая причина провала блефа
    // другая: после двух коллов промахнувшихся рук в диапазоне почти не осталось. Даём это фактом,
    // иначе модель обесценивает верное рассуждение игрока неверным доводом. Префлоп не считаем —
    // там коллируют широко и дёшево, сигнал о сужении даёт только оплаченный БОРД.
    const boardStreets = ["FLOP", "TURN", "RIVER"];
    const paidBefore = boardStreets
      .slice(0, boardStreets.indexOf(b.street))
      .filter((s) => snapshot.actions.some((a) => a.actor !== "Hero" && a.street === s && a.action === "CALL")).length;
    if (!b.madeValue && paidBefore > 0)
      line += ` Соперник уже оплатил ${paidBefore === 1 ? "одну улицу" : `${paidBefore} улицы`} на этом борде: промахнувшиеся руки сбрасывались РАНЬШЕ, и к этой улице его диапазон сузился до готовых рук и сильных дро. Нужные ≥${b.foldsNeededPct}% фолдов считай ИЗ ТОГО, что реально дошло сюда. НЕ объясняй провал блефа тем, что соперник «не сбросит» слабые руки вроде голого оверкарда без пары: такие руки сюда обычно уже не доходят - блеф не окупается не потому, что они коллируют, а потому что их в диапазоне почти не осталось.`;
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
    // Игрок здесь СБРОСИЛ — значит любой намёк «надо было платить» обязан опираться на эту цену.
    // Требование стоит ровно в той строке, где лежит число: промпт про это говорит дважды, но
    // модель забывает (эталон iPoker 09.08 — 8 браков сторожа на 30 раздач). Сторож
    // `disputesFoldWithoutPrice` бракует такой текст, так что подсказка тут экономит ретраи.
    if (snapshot.actions.some((a) => a.actor === "Hero" && a.street === h.street && a.action === "FOLD"))
      line += ` Игрок ЗДЕСЬ СБРОСИЛ. Хочешь сказать, что колл был лучше, - НАЗОВИ этот порог (≈${h.equityToCallPct}%) прямо в тексте и покажи, откуда у его руки столько эквити против диапазона, который так ставит. Без числа спорить с фолдом нельзя.`;
    // Мультивей в точке решения: против скольких диапазонов реально играется колл. Пот-оддс считает
    // ЦЕНУ и ничего не знает про число соперников — без этой строки модель берёт цену, видит «пара+»
    // и объявляет колл стандартом (регресс 07.08). Единственное/множественное число дальше по строке
    // тоже переключаем: «диапазон соперника» в единственном числе и есть та самая ошибка.
    const multiway = (h.oppsInPot ?? 0) >= 2;
    if (multiway) {
      line += ` ⚠️Решение МУЛЬТИВЕЙ: в банке уже ${h.oppsInPot} соперника - ставку сделал один, а поддержали её и другие. Колл обязан обойти ВСЕ ${h.oppsInPot} диапазона сразу; пот-оддс этого не учитывает, он считает только цену. Тот, кто заколлировал ставку между вами, воздухом это делает редко - его диапазон уже сужен до готовых рук и дро. НЕ рассуждай о «диапазоне соперника» в единственном числе и не называй фолд осторожничаньем, опираясь на одну цену колла.`;
    }
    if (h.madeValue) {
      // Готовая рука пара+: оценка колла — по силе руки против диапазона, дро (если есть) лишь апсайд.
      // НЕ гнать «слабое дро, обратные оддсы» — это перевёртыш для руки, которая часто уже впереди.
      const vsWhom = multiway ? "диапазонов всех, кто уже в банке" : "диапазона соперника";
      line += h.drawEquityPct !== undefined
        ? ` У Hero уже готовая рука (пара+) плюс дро сверху (≈${h.drawEquityPct}% к след. карте) - оценивай по силе руки против ${vsWhom}, дро это апсайд, а не основание колла.`
        : ` У Hero готовая рука (пара+) - оценивай колл по силе руки против ${vsWhom}, не только по пот-оддсам.`;
      // «пара+» одинаково накрывает топ-пару и карманную шестёрку под K и T — а это разные руки.
      // Слабую пару называем слабой ЯВНО, иначе мультивей-фолд превращается в «пассивность».
      if (h.madeWeak)
        line += ` ⚠️Но пара у Hero СЛАБАЯ (ниже двух карт борда) - это не «готовая рука, которой хватает эквити»${multiway ? ": против ставки и колла такая рука обычно позади обеих, и фолд здесь нормальная линия, а не осторожничанье" : ""}.`;
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
  // Hero пошёл в олл-ин — детектим ШИРЕ, чем action==ALL_IN: колл чужого олл-ина записан как CALL
  // (регресс KQ на K66, Артём 18.07: тренер спрашивал «какой план на тёрне/ривере», хотя Hero
  // заколлировал олл-ин на флопе — будущих улиц для решений НЕТ). Ловим и ALL_IN, и CALL против
  // уже стоящего на этой улице чужого олл-ина.
  const heroAllInIdx = snapshot.actions.findIndex((a, i) => {
    if (a.actor !== "Hero") return false;
    if (a.action === "ALL_IN") return true;
    return (
      a.action === "CALL" &&
      snapshot.actions
        .slice(0, i)
        .some((b) => b.actor !== "Hero" && b.street === a.street && b.action === "ALL_IN")
    );
  });
  if (heroAllInIdx >= 0) {
    const act = snapshot.actions[heroAllInIdx];
    const street = STREET_RU[act.street];
    // Колл олл-ина ≠ пуш (регресс K5): отличаем по чужой ставке/олл-ину на той же улице ДО хода
    // Hero, которую Hero лишь МАТЧИТ. CALL — всегда матч; ALL_IN — матч, если не превышает facing.
    const amt = act.amount ?? 0;
    const facing = snapshot.actions
      .slice(0, heroAllInIdx)
      .filter(
        (a) =>
          a.actor !== "Hero" &&
          a.street === act.street &&
          (a.action === "BET" || a.action === "RAISE" || a.action === "ALL_IN"),
      )
      .reduce((m, a) => Math.max(m, a.amount ?? 0), 0);
    const wasCall = act.action === "CALL" || (facing > 0 && facing >= amt);
    // Остаток Hero ПОСЛЕ этого хода: если ~0 — он сам ва-банк; если остаётся стек — он лишь ЗАКОЛЛИРОВАЛ
    // более короткий олл-ин и НЕ ва-банк (Артём 18.07: тренер называл такой колл «твоим олл-ином» и
    // считал Hero коротким на 15 BB, хотя у него 39.5 BB и он перекрывает коротыша).
    const stAfterAllIn = tableStateUpTo(snapshot, heroAllInIdx);
    const heroRemAfter = stAfterAllIn.seats.find((s) => s.isHero)?.remainingStack ?? 0;
    const heroCommitted = act.action === "ALL_IN" || heroRemAfter <= (bb ? bb * 0.5 : 1);
    const heroBehindBb = bb ? round1(heroRemAfter / bb) : null;
    // Соперники, реально ушедшие ва-банк, — по ДЕЙСТВИЮ ALL_IN (надёжнее арифметики остатка, которая
    // в синтетике/несогласованных стеках врёт). «Будущих улиц для решений нет» держится ВСЕГДА, кроме
    // одного случая: Hero лишь ЗАКОЛЛИРОВАЛ более короткий олл-ин, оставшись со стеком, И за столом есть
    // ещё живой соперник с фишками — тогда возможен постфлоп, не гасим вопросы про будущие улицы.
    const allInActors = new Set(
      snapshot.actions.filter((a) => a.action === "ALL_IN").map((a) => a.actor),
    );
    const liveOppWithChips = stAfterAllIn.seats.some(
      (s) => !s.isHero && !s.folded && !allInActors.has(s.label),
    );
    const heroStaysWithLiveOpp = wasCall && !heroCommitted && liveOppWithChips;
    const noFuture = heroStaysWithLiveOpp
      ? ""
      : ` После этого твоих РЕШЕНИЙ в раздаче больше нет: карты просто раздадут до вскрытия, будущих улиц для ТВОЕГО хода не будет. НЕ спрашивай «что ты будешь делать, если на тёрне/ривере выйдет такая-то карта» - следующего твоего действия в этой раздаче не существует.`;
    // Анти-сет-майнинг: с карманной парой в колле олл-ина модель срывается в «нет имплайд-оддсов, не
    // соберёшь сет — фолд». Это КОЛЛ на вскрытие, постфлопа нет — пара играет ЭКВИТИ против диапазона,
    // а не «попаду ли в сет» (Артём 18.07: «играешь в сет-майнинг без сетов»).
    const heroPair =
      snapshot.heroCards.length === 2 && snapshot.heroCards[0][0] === snapshot.heroCards[1][0];
    // ⚠️Довод «постфлоп-ставок нет» верен ТОЛЬКО когда доигровки действительно не будет — то есть
    // при том же условии, что и «будущих улиц нет». Если Hero перекрыл коротыша и за столом остался
    // живой соперник с фишками, постфлоп ВОЗМОЖЕН, и утверждение становится ложным (аудит румов
    // 19.07, iPoker). Пара всё равно играет эквити, но обосновываем это без вранья про постфлоп.
    const noSetmine =
      wasCall && heroPair && !heroStaysWithLiveOpp
        ? ` Это НЕ сет-майнинг: сет-майнинг — дешёвый колл в надежде собрать сет и выиграть большой банк ПОСТФЛОП, а тут постфлоп-ставок нет, рука идёт до вскрытия. Твоя пара играет на ЭКВИТИ против его диапазона (порог пот-оддсов уже посчитан выше), а не на «соберу ли сет» — не советуй фолд «потому что не попадёшь в сет».`
        : "";
    if (wasCall) {
      const callLead = heroCommitted
        ? `Твой олл-ин на ${street} был КОЛЛОМ чужой ставки/олл-ина (ты доложил последнее и закрыл торги), а НЕ твоим пушем`
        : `На ${street} ты ЗАКОЛЛИРОВАЛ олл-ин соперника (он ва-банк, а ТЫ — нет${heroBehindBb !== null ? `, у тебя остаётся ~${heroBehindBb} BB` : ""}): это НЕ твой пуш и НЕ короткий стек`;
      lines.push(
        `${callLead}: фолд-эквити тут нет, никто не «отвечает» на твой ход - соперник уже поставил ВСЁ до тебя. Разбирается правильность самого КОЛЛА (заплатить или сбросить со своей рукой против его диапазона), а НЕ «что ты хотел пушем» или «кого выбивал».${noSetmine}${noFuture}`,
      );
    } else {
      lines.push(
        `Ты пошёл олл-ином на ${street}.${noFuture} Разбирай только те решения, которые были ДО твоего олл-ина; не советуй сбросить или заколлировать после него. (Сколько стека реально под риском и что возвращается — в строке про геометрию ре-пуша, если она есть.)`,
      );
    }
  }

  // Мультивей-олл-ин: перед Hero УЖЕ несколько игроков ва-банк. Регресс ATo (Артём 18.07): тренер
  // выдумал «53% эквити», назвал верный фолд ошибкой и советовал коллить ATo против ТРЁХ шовов
  // через sunk-cost («банк наполовину твой») — околесица, переубедил игрока, который ответил верно.
  // Против нескольких олл-инов эквити резко падает (надо обойти ВСЕХ), точного числа парсер не даёт
  // (перебор диапазонов ×N неподъёмен). Гасим выдумку числа и sunk-cost детерминированным фактом.
  // ⚠️Считаем ТОЛЬКО тех, кто был ва-банк ДО хода Hero: факт говорит «перед тобой УЖЕ N ва-банк».
  // Раньше брались ВСЕ олл-ины раздачи, и строка вылезала там, где Hero сбросил ДО них или где
  // пушил сам, а соперники доколлировали после (аудит румов 19.07: воспроизведено на 4 румах).
  // Посты блайндов/анте решением Hero не являются — по ним не замеряем.
  let facingAllIns = 0;
  const allInSoFar = new Set<string>();
  for (const a of snapshot.actions) {
    if (a.actor !== "Hero") {
      if (a.action === "ALL_IN") allInSoFar.add(a.actor);
      continue;
    }
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;
    facingAllIns = Math.max(facingAllIns, allInSoFar.size);
  }
  const oppAllIns = { size: facingAllIns };
  if (oppAllIns.size >= 2) {
    lines.push(
      `Перед тобой УЖЕ ${oppAllIns.size} игрока ва-банк (несколько олл-инов сразу). Чтобы колл окупился, твоя рука должна обойти ВСЕХ разом - в мультивее эквити резко ниже, чем против одного, и ТОЧНОГО числа парсер тут НЕ считает (перебор диапазонов на каждого неподъёмен): процент эквити НЕ выдумывай, рассуждай словами («против трёх шовов даже сильная рука часто позади»). И вложенное ранее - уже НЕ твоё: у фишек нет памяти, не называй банк «наполовину твоим» и не гони колл через «раз уж вложил» - это ловушка невозвратных затрат, дисциплинированный фолд тут чаще верен.`,
    );
  }

  if (lines.length === 0) return "";
  return ["Числа от парсера (используй как есть; игроку объясняй простыми словами, без терминов):", ...lines].join("\n");
}

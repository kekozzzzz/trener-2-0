import type { Street, TableSnapshot } from "./types";
import { tableStateUpTo, boardUpToStreet } from "./table-state";
import { drawEquity, readHeroDraw } from "./draws";
import { heroMadeHand } from "./made-hand";
import { boardTexture } from "./facts";

// Альтернативные ветки решений: парсер считает ЧИСЛА непройденной ветки
// («ты заколлировал - вот числа, если бы рейзил»), но НЕ выносит вердикт «так лучше».
// Ранжирование «лучше/хуже» требует модели ответа соперника = это солвер, а продукт
// сознательно не солвер (неверный вердикт = репутационный риск). Здесь только детерминированная
// арифметика непройденного хода; «что выбрать» остаётся сократовским вопросом тренера.
//
// Фаза 1 (план 2026-07-09-альтернативные-ветки-подсказки): постфлоп рейз-полу-блеф на
// споте, где Hero пассивно ЗАКОЛЛИРОВАЛ (или сбросил) сильное дро против ставки. Размер
// гипотетического рейза - 3x ставки соперника (дефолт, решение Артёма). Числа для тренера
// внутренние: foldsNeededPct - порог окупаемости.
//
// ВАЖНО про формулировку (правка Артёма 2026-07-10): foldsNeededPct - это ДОЛЯ ДИАПАЗОНА
// соперника, которая должна сбросить, а НЕ «частота раз». Тренер переводит игроку так:
// «чтобы рейз окупился, больше N% его диапазона должно сброситься» - НЕ «он сбрасывает
// чаще N% раз». Та же правка нужна и существующей строке facts.ts «соперник сбрасывает
// чаще ≈Y%» при вплетении в промпт (сейчас боевой промпт не трогаем).
//
// Не вплетено в renderHandFacts (боевой промпт) - это отдельный гейтованный шаг.

// Состояние стола в ТОЧКЕ РЕШЕНИЯ (после действия actionIndex): банк, ставка перед Hero,
// остатки и SPR узла. Переиспользует прогон банка из table-state.ts (tableStateUpTo) -
// та же арифметика, что в facts.ts (walkPot), без дублирования.
export type NodeState = {
  actionIndex: number;
  street: Street;
  board: string[];
  pot: number; // банк на момент решения (включает ставку соперника)
  heroStreetBet: number; // вклад Hero на текущей улице к этому моменту
  currentBet: number; // ставка перед Hero (макс. вклад соперника на улице)
  toCall: number; // сколько Hero доложить для колла
  bettor: string | null; // соперник, поставивший currentBet
  heroRemaining: number; // остаток стека Hero
  effectiveRemaining: number; // min(остаток Hero, остаток соперника-в-игре)
  spr: number | null; // SPR в узле = effectiveRemaining / pot (не только на флопе)
};

export function nodeStateAt(snapshot: TableSnapshot, actionIndex: number): NodeState {
  const st = tableStateUpTo(snapshot, actionIndex);
  const hero = st.seats.find((s) => s.isHero);
  const heroStreetBet = hero?.streetBet ?? 0;
  const heroRemaining = hero?.remainingStack ?? 0;

  const opps = st.seats.filter((s) => !s.isHero && !s.folded);
  const currentBet = Math.max(heroStreetBet, ...opps.map((s) => s.streetBet), 0);
  const toCall = Math.max(currentBet - heroStreetBet, 0);
  const bettor = opps.find((s) => s.streetBet === currentBet && currentBet > 0) ?? null;
  const effectiveRemaining = bettor ? Math.min(heroRemaining, bettor.remainingStack) : heroRemaining;
  const spr = st.potSoFar > 0 ? Math.round((effectiveRemaining / st.potSoFar) * 10) / 10 : null;

  return {
    actionIndex,
    street: st.street,
    board: st.board,
    pot: st.potSoFar,
    heroStreetBet,
    currentBet,
    toCall,
    bettor: bettor?.label ?? null,
    heroRemaining,
    effectiveRemaining,
    spr,
  };
}

export type AltRaiseReason = "SEMI_BLUFF_DRAW" | "VALUE_RAISE" | "CHEAP_RAISE";

export type AltRaise = {
  street: Street;
  actualAction: "CALL" | "FOLD"; // что Hero сыграл вместо рейза
  toCall: number;
  villainBet: number; // ставка соперника, которую Hero не рейзил
  raiseTo: number; // гипотетический рейз (3x ставки)
  risk: number; // фишки, которыми Hero рискует в рейзе
  // ДОЛЯ ДИАПАЗОНА соперника, которая должна сбросить, чтобы рейз окупился сразу (risk/(risk+банк)).
  // НЕ «частота раз». ВНУТРЕННЕЕ; тренер объясняет: «больше N% его диапазона должно сброситься».
  foldsNeededPct: number;
  potIfCalled: number; // корректный банк при колле рейза (соперник докладывает разницу)
  spr: number | null;
  reason: AltRaiseReason;
  madeHand?: string; // для VALUE_RAISE / CHEAP_RAISE
  drawKind?: string; // для SEMI_BLUFF_DRAW (и CHEAP_RAISE с дро)
  outsRaw?: number;
  outsClean?: number;
  drawEquityRawPct?: number;
  drawEquityCleanPct?: number;
};

function boardPaired(board: string[]): boolean {
  const ranks = board.map((c) => c[0]?.toUpperCase());
  return new Set(ranks).size < ranks.length;
}

// Рейз вместо пассивного колла/фолда - показываем ТОЛЬКО когда осмыслен (не «0 в нулю»):
//  VALUE_RAISE   - сильная готовая рука (две пары+) ИЛИ топ-пара/оверпара на дровяной доске;
//  SEMI_BLUFF_DRAW - воздух + настоящее сильное дро (FD/ОЭСД ≥8 аутов, борд не спаренный);
//  CHEAP_RAISE   - соперник поставил МЕЛКО (<33% банка) и у Hero есть какая-то рука/дро.
// Приоритет: велью → полу-блеф → дешёвый рейз. Чистый воздух без дро не трогаем.
// Мокрая доска для велью-рейза: есть флеш-дро (две+ одной масти) ИЛИ реально связная
// (много стрит-дро). Полусвязный радужный борд (K-9-3-7) мокрым НЕ считаем - там велью-
// рейз топ-парой ни к чему (защищать не от чего), калл нормален.
function isWetBoard(board: string[]): boolean {
  const t = boardTexture(board);
  return t ? t.suitedness !== "RAINBOW" || t.connected === "CONNECTED" : false;
}

export function alternativeRaises(snapshot: TableSnapshot): AltRaise[] {
  const out: AltRaise[] = [];
  const actions = snapshot.actions;

  for (let i = 1; i < actions.length; i++) {
    const a = actions[i];
    if (a.actor !== "Hero") continue;
    if (a.action !== "CALL" && a.action !== "FOLD") continue; // рейз уже сыгран - альтернатива не нужна
    if (a.street === "PREFLOP") continue; // постфлоп

    const node = nodeStateAt(snapshot, i - 1); // состояние, которое Hero застал
    if (node.street !== a.street) continue;
    if (node.toCall <= 0) continue; // не перед ставкой
    if (node.heroStreetBet !== 0) continue; // чистый facing-a-bet (не чек-рейз в Hero)
    if (node.board.length < 3) continue;

    const made = heroMadeHand(snapshot.heroCards, node.board);
    if (!made) continue;
    const draw = node.board.length <= 4 ? readHeroDraw(snapshot.heroCards, node.board) : null;
    const strongDraw = !!draw && !draw.backdoorOnly && draw.outsRaw >= 8 && !boardPaired(node.board);
    const wet = isWetBoard(node.board);

    const villainBet = node.currentBet;
    const potBefore = node.pot - villainBet;
    const betPct = potBefore > 0 ? (villainBet / potBefore) * 100 : 100;
    const raiseTo = 3 * villainBet; // дефолт: чек-рейз до 3x ставки
    const risk = raiseTo - node.heroStreetBet; // = raiseTo (heroStreetBet === 0)
    const foldsNeededPct = Math.round((risk / (risk + node.pot)) * 100);
    // Корректный банк при колле: соперник УЖЕ вложил villainBet, докладывает лишь разницу.
    const potIfCalled = node.pot + risk + (raiseTo - villainBet);
    const cardsToCome: 1 | 2 = node.board.length === 3 ? 2 : 1;
    const eq = node.board.length <= 4 ? drawEquity(snapshot.heroCards, node.board, cardsToCome) : null;

    const base = {
      street: a.street,
      actualAction: a.action,
      toCall: node.toCall,
      villainBet,
      raiseTo,
      risk,
      foldsNeededPct,
      potIfCalled,
      spr: node.spr,
    } as const;

    if (made.strength === "STRONG_MADE" || (made.strength === "STRONG_PAIR" && wet)) {
      out.push({ ...base, reason: "VALUE_RAISE", madeHand: made.ru });
    } else if (strongDraw && draw) {
      out.push({
        ...base,
        reason: "SEMI_BLUFF_DRAW",
        drawKind: draw.kind,
        outsRaw: draw.outsRaw,
        outsClean: draw.outsClean,
        drawEquityRawPct: eq?.rawPct,
        drawEquityCleanPct: eq?.cleanPct,
      });
    } else if (betPct < 33 && (made.strength !== "AIR" || (draw && !draw.backdoorOnly && draw.outsRaw > 0))) {
      // Дешёвый рейз против мелкой ставки: есть какая-то рука/дро (не голый воздух).
      out.push({
        ...base,
        reason: "CHEAP_RAISE",
        madeHand: made.ru,
        drawKind: draw && !draw.backdoorOnly ? draw.kind : undefined,
        drawEquityRawPct: eq?.rawPct,
      });
    }
  }

  return out;
}

// ── Чек→бет: упущенный велью-бет / упущенный полу-блеф ──────────────────────────────
// Когда Hero ПРОЧЕКАЛ, а улицу прочекали насквозь (ставки не было), с сильной рукой это
// НЕДОБОР (самая дорогая ошибка на микро - подаренные ставки), а с сильным дро - упущенный
// полу-блеф. Показываем ЧИСЛА непройденного бета (велью - банк при колле; полу-блеф -
// фолд-эквити + эквити дро), НЕ вердикт. Форму берём из силы руки (единый источник).
// Размер гипотетического бета - 2/3 банка (стандарт). Средние/слабые руки и воздух без
// дро не трогаем: там чек нормален.

export type CheckBetReason = "MISSED_VALUE" | "MISSED_SEMI_BLUFF";

export type CheckBetAlt = {
  street: Street;
  actionIndex: number;
  madeHand: string;
  reason: CheckBetReason;
  suggestedBetPctOfPot: number; // ~67 (2/3 банка)
  suggestedBet: number; // фишки
  potIfCalled: number; // банк, если бет заколлируют
  foldsNeededPct?: number; // доля диапазона, которая должна сброситься (для полу-блефа)
  drawEquityRawPct?: number;
  drawEquityCleanPct?: number;
  rationale: string;
};

// ── Probe-bet: соперник сдал инициативу (нет c-bet) → терн твой ─────────────────────
// Дефолтный спот MTT: ты защищал BB, префлоп-агрессор НЕ поставил c-bet (флоп прочекан
// насквозь в его позиции) - он показал слабость, и терн это стандартный probe/лид. Это
// ОРИЕНТИР по частоте (бьёшь большей частью диапазона и сдаёшься при сопротивлении), НЕ
// метка «блеф/велью». Даём число фолд-эквити (доля его диапазона, которая должна
// сброситься) + оговорка про телефон. Фолд-эквити = доля ДИАПАЗОНА, не «частота раз».
// Hand-agnostic: спот важен сам по себе, независимо от конкретной руки Hero.

export type ProbeSpot = {
  street: Street; // TURN (лид терна после прочеканного флопа)
  pot: number;
  suggestedBet: number; // ~2/3 банка
  suggestedBetPctOfPot: number;
  foldsNeededPct: number; // доля диапазона соперника, которая должна сброситься, чтобы атака окупилась
  rationale: string;
};

function lastPreflopRaiser(snapshot: TableSnapshot): string | null {
  let raiser: string | null = null;
  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break;
    if (a.action === "RAISE" || a.action === "ALL_IN") raiser = a.actor;
  }
  return raiser;
}

export function probeBetSpots(snapshot: TableSnapshot): ProbeSpot[] {
  const aggressor = lastPreflopRaiser(snapshot);
  if (!aggressor || aggressor === "Hero") return []; // Hero сам был агрессором → это c-bet, не проба
  if (!streetCheckedThrough(snapshot, "FLOP")) return []; // c-bet был → инициативу не сдавали

  // Hero OOP: на флопе сходил РАНЬШЕ агрессора (иначе это не лид-проба из блайнда).
  const flop = snapshot.actions.map((a, i) => ({ a, i })).filter((x) => x.a.street === "FLOP");
  const heroFlop = flop.find((x) => x.a.actor === "Hero");
  const aggFlop = flop.find((x) => x.a.actor === aggressor);
  if (!heroFlop || !aggFlop || heroFlop.i > aggFlop.i) return [];

  // На терне первое действие Hero. Флагаем УПУЩЕННУЮ пробу: он прочекал вместо лида.
  const turnIdx = snapshot.actions.findIndex((a) => a.street === "TURN" && a.actor === "Hero");
  if (turnIdx < 0 || snapshot.actions[turnIdx].action !== "CHECK") return [];

  const pot = nodeStateAt(snapshot, turnIdx).pot;
  if (pot <= 0) return [];
  const bet = Math.round((pot * 2) / 3);
  const foldsNeededPct = Math.round((bet / (bet + pot)) * 100);

  return [
    {
      street: "TURN",
      pot,
      suggestedBet: bet,
      suggestedBetPctOfPot: 67,
      foldsNeededPct,
      rationale: `Соперник (префлоп-агрессор) НЕ поставил c-bet на флопе - сдал инициативу, показал слабость. Терн это стандартный probe/лид: бьёшь БОЛЬШЕЙ частью диапазона (не важно велью или блеф) и сдаёшься при сопротивлении. Ставка ~2/3 банка окупается как атака, если он сбрасывает больше ${foldsNeededPct}% своего диапазона - а он уже сдал флоп. Оговорка: против телефона (не сбрасывает) это не работает - там бей только на велью.`,
    },
  ];
}

// ── C-bet-спот: ты агрессор на СВОЕЙ доске → c-bet большей частью диапазона ──────────
// Ты префлоп-агрессор, доска высокая/бродвейная (преимущество диапазона у открывашки),
// но ты прочекал флоп. C-bet тут стандартен большей частью руки - ОРИЕНТИР по частоте,
// не метка «блеф/велью». ВАЖНО (правка Артёма): пропуск c-bet сдаёт инициативу - в твой
// чек часто прилетит ставка, и с мусором придётся сбросить банк, который ты забрал бы
// c-betом на флопе (у соперника тоже часто мусор). Это последствие вшито в rationale.
// Доску классифицируем детерминированно (heuristic «чья доска»): высокая/бродвейная -
// агрессору, низкая/связная - защищающемуся (там чек нормален, не флагаем).

const RANK_N: Record<string, number> = {
  "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, T: 10, J: 11, Q: 12, K: 13, A: 14,
};

// Доска преимущества агрессора: топ-карта Q+ (A/K/Q-хай) ИЛИ два+ бродвея (T+). Низкие/
// одно-средние борды сюда не попадают - там доска защищающегося, c-bet не флагаем.
function boardFavorsAggressor(board: string[]): boolean {
  const ranks = board.slice(0, 3).map((c) => RANK_N[c[0]?.toUpperCase()]).filter((r): r is number => r != null);
  if (ranks.length < 3) return false;
  const top = Math.max(...ranks);
  const broadway = ranks.filter((r) => r >= 10).length;
  return top >= 12 || broadway >= 2;
}

export type CbetSpot = {
  street: Street; // FLOP
  pot: number;
  suggestedBet: number;
  suggestedBetPctOfPot: number;
  foldsNeededPct: number;
  rationale: string;
};

export function cbetSpots(snapshot: TableSnapshot): CbetSpot[] {
  if (lastPreflopRaiser(snapshot) !== "Hero") return []; // c-bet - только когда агрессор ты
  const board = boardUpToStreet(snapshot.board, "FLOP");
  if (board.length < 3 || !boardFavorsAggressor(board)) return []; // не твоя доска → чек нормален

  const flop = snapshot.actions.filter((a) => a.street === "FLOP" && a.actor === "Hero");
  if (flop.length === 0 || flop[0].action !== "CHECK") return []; // c-bet поставил / не его спот
  if (flop.some((a) => a.action === "BET" || a.action === "RAISE")) return []; // чек-рейз - был агрессивен

  const checkIdx = snapshot.actions.findIndex((a) => a.street === "FLOP" && a.actor === "Hero" && a.action === "CHECK");
  const pot = nodeStateAt(snapshot, checkIdx).pot;
  if (pot <= 0) return [];
  const bet = Math.round((pot * 2) / 3);
  const foldsNeededPct = Math.round((bet / (bet + pot)) * 100);

  return [
    {
      street: "FLOP",
      pot,
      suggestedBet: bet,
      suggestedBetPctOfPot: 67,
      foldsNeededPct,
      rationale: `Ты префлоп-агрессор на СВОЕЙ доске (высокая/бродвейная - преимущество диапазона у открывашки): c-bet стандартен большей частью руки, не важно велью или блеф. Прочекав, ты СДАЁШЬ инициативу - в твой чек часто прилетит ставка, и с мусором придётся сбросить банк, который ты забрал бы c-betом на флопе (у соперника тоже часто мусор - ты мог выиграть раздачу тут же). Ставка ~2/3 банка окупается, если он сбрасывает больше ${foldsNeededPct}% диапазона. Оговорка: против телефона (не сбрасывает) - c-bet только на велью.`,
    },
  ];
}

// Прочекали ли улицу насквозь (ни одной ставки/рейза/олл-ина на ней).
function streetCheckedThrough(snapshot: TableSnapshot, street: Street): boolean {
  for (const a of snapshot.actions) {
    if (a.street !== street) continue;
    if (a.action === "BET" || a.action === "RAISE" || a.action === "ALL_IN") return false;
  }
  return true;
}

export function checkBetAlternatives(snapshot: TableSnapshot): CheckBetAlt[] {
  const out: CheckBetAlt[] = [];

  for (let i = 0; i < snapshot.actions.length; i++) {
    const a = snapshot.actions[i];
    if (a.actor !== "Hero" || a.action !== "CHECK") continue;
    if (a.street === "PREFLOP") continue;
    if (!streetCheckedThrough(snapshot, a.street)) continue; // была ставка → чек-колл/рейз, не «прочекали»

    const board = boardUpToStreet(snapshot.board, a.street);
    if (board.length < 3) continue;
    const made = heroMadeHand(snapshot.heroCards, board);
    if (!made) continue;

    const pot = nodeStateAt(snapshot, i).pot;
    if (pot <= 0) continue;
    const bet = Math.round((pot * 2) / 3);
    const potIfCalled = pot + 2 * bet;

    if (made.strength === "STRONG_MADE" || made.strength === "STRONG_PAIR") {
      out.push({
        street: a.street,
        actionIndex: i,
        madeHand: made.ru,
        reason: "MISSED_VALUE",
        suggestedBetPctOfPot: 67,
        suggestedBet: bet,
        potIfCalled,
        rationale: `${made.ru} - улицу прочекали, ставки не было: был велью-бет (~2/3 банка), который добрал бы с того, что слабее (недобор - на микро самая дорогая ошибка)`,
      });
      continue;
    }

    const draw = readHeroDraw(snapshot.heroCards, board);
    if (made.strength === "AIR" && draw && !draw.backdoorOnly && draw.outsRaw >= 8 && board.length <= 4) {
      const cardsToCome: 1 | 2 = board.length === 3 ? 2 : 1;
      const eq = drawEquity(snapshot.heroCards, board, cardsToCome);
      out.push({
        street: a.street,
        actionIndex: i,
        madeHand: made.ru,
        reason: "MISSED_SEMI_BLUFF",
        suggestedBetPctOfPot: 67,
        suggestedBet: bet,
        potIfCalled,
        foldsNeededPct: Math.round((bet / (bet + pot)) * 100),
        drawEquityRawPct: eq?.rawPct,
        drawEquityCleanPct: eq?.cleanPct,
        rationale: `воздух + ${draw.kind} - улицу прочекали: был полу-блеф-бет (~2/3 банка) с двумя путями к победе (фолд сейчас или доезд)`,
      });
    }
  }

  return out;
}

// ── Facing чек-рейз / рейз: геройский колл слабой рукой = лик, дефолт ФОЛД ────────────
// Ты поставил, соперник ПОДНЯЛ (чек-рейз или рейз в твой бет) на тёрне/ривере. По
// фреймворку это, как правило, реальная сила (особенно чек-рейз на тёрне): дефолт фолд.
// Флагаем УПУЩЕННЫЙ фолд - когда Hero заколлировал слабой рукой (слабая/средняя пара,
// воздух) без сильного дро. Сильная рука / живое дро - колл нормален, не трогаем. Число -
// пот-оддс (сколько эквити требовал колл); вердикт «сила» - не приговор, а повод для рида.

export type FacingRaiseAlt = {
  street: Street;
  actionIndex: number;
  toCall: number;
  equityToCallPct: number; // пот-оддс: нужное эквити для колла
  madeHand: string;
  rationale: string;
};

export function facingRaiseAlternatives(snapshot: TableSnapshot): FacingRaiseAlt[] {
  const out: FacingRaiseAlt[] = [];
  const actions = snapshot.actions;

  for (let i = 1; i < actions.length; i++) {
    const a = actions[i];
    if (a.actor !== "Hero" || a.action !== "CALL") continue;
    if (a.street !== "TURN" && a.street !== "RIVER") continue; // чек-рейз страшнее всего на тёрне/ривере

    const node = nodeStateAt(snapshot, i - 1);
    if (node.street !== a.street) continue;
    if (node.heroStreetBet <= 0 || node.toCall <= 0) continue; // Hero не ставил первым → это не рейз в его бет

    const board = boardUpToStreet(snapshot.board, a.street);
    if (board.length < 3) continue;
    const made = heroMadeHand(snapshot.heroCards, board);
    if (!made) continue;
    const draw = board.length <= 4 ? readHeroDraw(snapshot.heroCards, board) : null;
    const strongDraw = !!draw && !draw.backdoorOnly && draw.outsRaw >= 8;
    const weak = made.strength !== "STRONG_MADE" && made.strength !== "STRONG_PAIR" && !strongDraw;
    if (!weak) continue; // сильная рука / живое дро - колл нормален

    const equityToCallPct = Math.round((node.toCall / (node.pot + node.toCall)) * 100);
    const streetRu = a.street === "TURN" ? "тёрне" : "ривере";
    out.push({
      street: a.street,
      actionIndex: i,
      toCall: node.toCall,
      equityToCallPct,
      madeHand: made.ru,
      rationale: `Ты поставил, соперник ПОДНЯЛ (чек-рейз/рейз) на ${streetRu}, у тебя ${made.ru} - слабая рука без дро. Рейз в полбанка+ на тёрне/ривере это, как правило, реальная сила: дефолт тут ФОЛД. Доплата ${node.toCall} требует ${equityToCallPct}% эквити - геройский колл оправдан ТОЛЬКО при конкретном чтении, что именно этот игрок так блефует. Без рида - фолд.`,
    });
  }

  return out;
}

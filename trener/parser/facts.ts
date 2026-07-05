import type { Street, TableAction, TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { boardUpToStreet } from "./table-state";
import { heroMadeHand } from "./made-hand";
import { readHeroDraw, drawEquity, type DrawRead } from "./draws";
import { handCode } from "@/config/poker/hand-codes";
import { preflopChartFact } from "./preflop-chart-fact";

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

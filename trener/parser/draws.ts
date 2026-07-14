import { handCategory, heroMadeHand, cardSetValue } from "./made-hand";

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
  if (flushSuit) {
    // Нат-статус флеш-дро (свип): доезд МЛАДШЕГО флеша может проиграть старшему. Считаем по
    // старшей карте Hero в масти дро, сколько живых старших карт масти осталось у соперников.
    const suitSeen = new Set(
      [...hero, ...board].filter((c) => c[1].toLowerCase() === flushSuit).map(parseRank),
    );
    const heroTopInSuit = Math.max(
      ...hero.filter((c) => c[1].toLowerCase() === flushSuit).map((c) => parseRank(c) ?? 0),
    );
    let higherLive = 0;
    for (let r = 14; r > heroTopInSuit; r--) if (!suitSeen.has(r)) higherLive++;
    // Склонение «живая карта / живые карты / живых карт» по числу (иначе «1 живых карт масти»).
    const m10 = higherLive % 10,
      m100 = higherLive % 100;
    const cardWord =
      m10 === 1 && m100 !== 11
        ? "живая карта"
        : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)
          ? "живые карты"
          : "живых карт";
    kinds.push(
      higherLive === 0
        ? "флеш-дро к НАТСАМ"
        : `флеш-дро НЕ к натсам (выше твоей старшей ещё ${higherLive} ${cardWord} масти - доедешь, но можешь проиграть старшему флешу)`,
    );
  }
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

// Оверкарты к паре Hero (свип «оверкарты на глаз»): сколько рангов СТАРШЕ пары Hero, которых
// нет ни на борде, ни в руке Hero, могут прийти на следующей улице и дать СОПЕРНИКУ пару выше.
// Свои карты (кикеры выше пары) исключаем — их приход пейрит кикер во ВТОРУЮ пару Hero, это его
// улучшение, а не угроза (KQ на Q72: K-тёрн — друг, не враг). Только своя пара (не пара борда).
export function overcardsToPair(hero: string[], board: string[]): { count: number } | null {
  if (hero.length < 2 || board.length < 3 || board.length > 4) return null;
  const mh = heroMadeHand(hero, board);
  if (!mh || mh.category !== "PAIR" || mh.strength === "AIR") return null; // только своя пара
  const pairRank = cardSetValue([...hero, ...board])[1];
  const boardRanks = new Set(ranksOf(board));
  const heroRanks = new Set(ranksOf(hero)); // свои карты — не угроза (дают Hero две пары)
  let count = 0;
  for (let r = 14; r > pairRank; r--) {
    if (boardRanks.has(r) || heroRanks.has(r)) continue;
    count++;
  }
  if (count === 0) return null;
  return { count };
}

// Scare-карты следующей улицы (свип): сколько карт колоды СОЗДАЮТ новую угрозу против готовой
// руки Hero — поднимают масть с 2 до 3 (новая флеш-угроза), впервые дают стрит-борд или впервые
// спаривают борд (две пары/трипс на доске). Считаем УЖЕ существующие угрозы (борд монотонный,
// уже спарен) НЕ считаем — их несёт текстура/опасность борда, а тут именно «что ДОБАВИТ карта».
// Оверкарты сюда НЕ входят — для них отдельный факт overcardsToPair (иначе двойной учёт).
// Гейт: рука Hero пара..сет/трипс (натсам scare не страшен, воздуху — не про силу).
export function scareCards(hero: string[], board: string[]): { count: number; total: number } | null {
  if (hero.length < 2 || board.length < 3 || board.length > 4) return null;
  const heroCat = handCategory([...hero, ...board]);
  if (heroCat < 2 || heroCat >= 5) return null; // только пара..сет/трипс
  const boardStraightNow = hasStraightRanks(ranksOf(board));
  const boardCatNow = handCategory(board);
  const deck = unseenCards([...hero, ...board]);
  let count = 0;
  for (const c of deck) {
    const nb = [...board, c];
    const cSuit = c[1].toLowerCase();
    const cSuitOnBoard = board.filter((bc) => bc[1].toLowerCase() === cSuit).length;
    const heroSuitCount = hero.filter((hc) => hc[1].toLowerCase() === cSuit).length;
    // Карта поднимает масть с 2 до 3 = флеш-угроза. НО если сам Hero держит 2 карты этой масти, эта
    // же карта даёт флеш ЕМУ (это его аут, не угроза) — не считаем скэром (ревью согласованности).
    const flushScare = cSuitOnBoard === 2 && heroSuitCount < 2;
    const straightScare = !boardStraightNow && hasStraightRanks(ranksOf(nb)); // карта ВПЕРВЫЕ даёт стрит-борд
    const pairScare = boardCatNow < 3 && handCategory(nb) >= 3; // карта ВПЕРВЫЕ делает борд две пары+
    if (flushScare || straightScare || pairScare) count++;
  }
  if (count === 0) return null;
  return { count, total: deck.length };
}

// Подпись «до чего» улучшает аут (родительный падеж, по категории handValue).
const CATEGORY_GEN: Record<number, string> = {
  2: "пары",
  3: "двух пар",
  4: "сета/трипса",
  5: "стрита",
  6: "флеша",
  7: "фулл-хауса",
  8: "каре",
  9: "стрит-флеша",
};

export type OutsTarget = { toCategory: string; count: number; dirty: number };
export type ImprovementOuts = {
  outsRaw: number; // все одно-карточные ауты, поднимающие КАТЕГОРИЮ руки Hero
  outsClean: number; // из них «чистые» (не спаривают борд и не достраивают флеш сопернику)
  byTarget: OutsTarget[]; // разбивка по итоговой руке, сильные первыми
  taintReasons: string[]; // почему часть аутов грязная (для честной подачи)
};

// ВСЕ ауты Hero на улучшение — не только флеш/стрит-дро (readHeroDraw), а любая карта
// следующей улицы, поднимающая КАТЕГОРИЮ его руки: пара→две пары→сет→фулл и т.д.
// Перебор колоды (правило 1: число считает парсер, не LLM — иначе модель выдумывает).
// Аут засчитываем, только если рука Hero с этой картой И выше прежней, И сильнее голого
// борда (иначе улучшение играет борд — оно общее для всех, не личное усиление Hero).
// Грязные ауты помечаем детерминированно по борду (карт соперника не знаем): карта
// спаривает борд (у соперника возможны две пары/фулл сильнее) ИЛИ на борде становится
// 3+ одной масти, а сам Hero флеш не собрал (возможен флеш против него). Чистые — без
// этих флагов. null — борд не флоп/тёрн или улучшить категорию нечем.
export function improvementOuts(hero: string[], board: string[]): ImprovementOuts | null {
  if (hero.length < 2 || board.length < 3 || board.length > 4) return null;

  const oldHeroCat = handCategory([...hero, ...board]);
  const deck = unseenCards([...hero, ...board]);

  const groups = new Map<number, { count: number; dirty: number }>();
  const reasons = new Set<string>();
  let raw = 0;
  let clean = 0;

  for (const c of deck) {
    const newHeroCat = handCategory([...hero, ...board, c]);
    if (newHeroCat <= oldHeroCat) continue; // категория руки Hero не выросла
    const newBoardCat = handCategory([...board, c]);
    if (newHeroCat <= newBoardCat) continue; // улучшение играет борд, а не Hero

    raw++;
    const finalBoard = [...board, c];
    let dirty = false;
    if (boardPaired(finalBoard)) {
      dirty = true;
      reasons.add("спаривают борд (у соперника возможны две пары/фулл сильнее)");
    }
    if (threeOfASuit(finalBoard) && newHeroCat !== 6 && newHeroCat !== 9) {
      dirty = true;
      reasons.add("часть аутов достраивает 3+ одной масти на доске (возможен флеш у соперника)");
    }

    const g = groups.get(newHeroCat) ?? { count: 0, dirty: 0 };
    g.count++;
    if (dirty) g.dirty++;
    else clean++;
    groups.set(newHeroCat, g);
  }

  if (raw === 0) return null;

  const byTarget: OutsTarget[] = [...groups.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([cat, g]) => ({ toCategory: CATEGORY_GEN[cat] ?? "лучшей руки", count: g.count, dirty: g.dirty }));

  return { outsRaw: raw, outsClean: clean, byTarget, taintReasons: [...reasons] };
}

export type CardImpact = { kind: "boost" | "scare" | "busted" | "blank"; detail: string };

// Ярлык фактически ВЫПАВШЕЙ карты тёрна/ривера относительно руки Hero (свип, кандидат 4): усилила
// его (категория руки выросла и это не «играет борд»), скэр (создала угрозу сопернику - та же
// логика, что scareCards, но для конкретной карты), «дро сгорело» (на ривере было дро, не доехало)
// или блэнк. Раньше модель сама сверяла флоповые множества (improvementOuts/scareCards) с реальной
// картой и срывалась - называла опасную карту блэнком или наоборот. boardBefore = борд ДО карты
// (флоп для тёрн-карты, тёрн для ривер-карты). Правило 1: сверку считает парсер.
export function fallenCardImpact(hero: string[], boardBefore: string[], newCard: string): CardImpact | null {
  if (hero.length < 2 || boardBefore.length < 3 || boardBefore.length > 4) return null;
  const after = [...boardBefore, newCard];
  const catB = handCategory([...hero, ...boardBefore]);
  const catA = handCategory([...hero, ...after]);
  // усилила Hero — категория руки выросла И рука выше голого борда (иначе усиление играет борд).
  if (catA > catB && catA > handCategory(after))
    return { kind: "boost", detail: `подняла твою руку до ${CATEGORY_GEN[catA] ?? "лучшей руки"}` };
  // скэр против Hero — логика scareCards, но для этой конкретной карты.
  const boardStraightBefore = hasStraightRanks(ranksOf(boardBefore));
  const boardCatBefore = handCategory(boardBefore);
  const cSuitOnBoard = boardBefore.filter((bc) => bc[1].toLowerCase() === newCard[1].toLowerCase()).length;
  const flushScare = cSuitOnBoard === 2; // масть 2→3 на борде
  const straightScare = !boardStraightBefore && hasStraightRanks(ranksOf(after));
  const pairScare = boardCatBefore < 3 && handCategory(after) >= 3; // впервые спарила борд
  if (flushScare || straightScare || pairScare) {
    const parts: string[] = [];
    if (flushScare) parts.push("третья карта одной масти - флеш-угроза");
    if (straightScare) parts.push("замкнула стрит-борд");
    if (pairScare) parts.push("спарила борд - возможен фулл");
    return { kind: "scare", detail: parts.join("; ") };
  }
  // дро сгорело — только на РИВЕРЕ (boardBefore = тёрн), И у Hero было ГОЛОЕ дро (на тёрне пары+ не
  // было, catB≤1). Иначе комбо-рука (топ-пара + флеш-дро → ривер-блэнк) ложно звалась «блеф-кэтчер»,
  // хотя готовая рука осталась (ревью доводок, HIGH). catA<5 = не собрал стрит/флеш.
  if (boardBefore.length === 4 && catB <= 1) {
    const drawBefore = readHeroDraw(hero, boardBefore);
    if (drawBefore && catA < 5 && catA <= catB)
      return { kind: "busted", detail: "твоё голое дро не доехало - шоудаун-силы нет, только блеф-кэтчер" };
  }
  return { kind: "blank", detail: "тебя не усилила и новой угрозы на борд не принесла (блэнк)" };
}

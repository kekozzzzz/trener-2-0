// Детерминированный определитель ГОТОВОЙ руки Hero (правило 1: комбинацию считает
// парсер, не LLM). Дешёвые модели путали пару/две пары/фулл и «выдумывали попадание»
// именно потому, что состав руки им не давали — этот модуль закрывает дыру.
//
// Здесь только точная арифметика рангов и мастей по картам Hero + борду. Никаких
// чартов и эквити против диапазона (их сознательно оставляем модели — см. facts.ts).

// ТОЛЬКО тип: стирается при компиляции, рантайм-цикла нет (range-buckets импортирует нас).
import type { DeckOdds } from "./range-buckets";

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

// Имена рангов: единственное (старшая карта — «туз») и родительный мн. («пара тузов»).
const SG: Record<number, string> = {
  14: "туз", 13: "король", 12: "дама", 11: "валет", 10: "десятка", 9: "девятка",
  8: "восьмёрка", 7: "семёрка", 6: "шестёрка", 5: "пятёрка", 4: "четвёрка", 3: "тройка", 2: "двойка",
};
const GEN_PL: Record<number, string> = {
  14: "тузов", 13: "королей", 12: "дам", 11: "валетов", 10: "десяток", 9: "девяток",
  8: "восьмёрок", 7: "семёрок", 6: "шестёрок", 5: "пятёрок", 4: "четвёрок", 3: "троек", 2: "двоек",
};
// Творительный падеж единственного числа («рука с десяткой», «с валетом») — иначе факт выходит
// на ломаном русском («любая рука с десятка»), и модель тащит эту корявость игроку.
const INS_SG: Record<number, string> = {
  14: "тузом", 13: "королём", 12: "дамой", 11: "валетом", 10: "десяткой", 9: "девяткой",
  8: "восьмёркой", 7: "семёркой", 6: "шестёркой", 5: "пятёркой", 4: "четвёркой", 3: "тройкой", 2: "двойкой",
};
// Родительный падеж единственного числа («до короля», «до девятки»).
const GEN_SG: Record<number, string> = {
  14: "туза", 13: "короля", 12: "дамы", 11: "валета", 10: "десятки", 9: "девятки",
  8: "восьмёрки", 7: "семёрки", 6: "шестёрки", 5: "пятёрки", 4: "четвёрки", 3: "тройки", 2: "двойки",
};

// Высота лучшего стрита в наборе рангов (туз и сверху, и снизу). 0 — стрита нет.
function bestStraight(ranks: number[]): number {
  const set = new Set(ranks);
  if (set.has(14)) set.add(1);
  for (let high = 14; high >= 5; high--) {
    let ok = true;
    for (let k = 0; k < 5; k++) if (!set.has(high - k)) { ok = false; break; }
    if (ok) return high;
  }
  return 0;
}

// Сравнимое значение лучшей 5-карточной руки из набора: [категория, …тай-брейки].
function handValue(cards: Card[]): number[] {
  const byRank = new Map<number, number>();
  for (const c of cards) byRank.set(c.rank, (byRank.get(c.rank) ?? 0) + 1);
  const bySuit = new Map<string, number[]>();
  for (const c of cards) {
    const a = bySuit.get(c.suit) ?? [];
    a.push(c.rank);
    bySuit.set(c.suit, a);
  }

  let flushRanks: number[] | null = null;
  for (const rs of bySuit.values()) if (rs.length >= 5) flushRanks = rs.slice().sort((a, b) => b - a);

  const allRanks = cards.map((c) => c.rank);
  const straightHigh = bestStraight(allRanks);
  const sfHigh = flushRanks ? bestStraight(flushRanks) : 0;

  // группы рангов: сперва по количеству, потом по достоинству
  const groups = [...byRank.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const counts = groups.map((g) => g[1]);
  const kickersExcept = (...exclude: number[]) =>
    allRanks.filter((r) => !exclude.includes(r)).sort((a, b) => b - a);

  if (sfHigh) return [9, sfHigh];
  if (counts[0] === 4) return [8, groups[0][0], kickersExcept(groups[0][0])[0] ?? 0];
  if (counts[0] === 3 && counts[1] >= 2) return [7, groups[0][0], groups[1][0]];
  if (flushRanks) return [6, ...flushRanks.slice(0, 5)];
  if (straightHigh) return [5, straightHigh];
  if (counts[0] === 3) return [4, groups[0][0], ...kickersExcept(groups[0][0]).slice(0, 2)];
  if (counts[0] === 2 && counts[1] === 2)
    return [3, groups[0][0], groups[1][0], kickersExcept(groups[0][0], groups[1][0])[0] ?? 0];
  if (counts[0] === 2) return [2, groups[0][0], ...kickersExcept(groups[0][0]).slice(0, 3)];
  return [1, ...[...new Set(allRanks)].sort((a, b) => b - a).slice(0, 5)];
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// Категория лучшей 5-карточной руки из набора карт (1 старшая … 9 стрит-флеш) —
// единый эвалюатор для draws.ts (точный перебор аутов/эквити). Толерантен к 1+ картам:
// с <5 картами стрит/флеш невозможны, вернёт пару/старшую. Кривые карты отбрасываются.
export function handCategory(cards: string[]): number {
  const cs = cards.map(parseCard).filter((c): c is Card => c !== null);
  if (cs.length === 0) return 1;
  return handValue(cs)[0];
}

// Сравнимое значение лучшей 5-карточной руки набора — для точного эквити против
// диапазона (parser/range-equity.ts): значение считается один раз и сравнивается
// многократно compareValues. Кривые карты отбрасываются (как в handCategory).
export function cardSetValue(cards: string[]): number[] {
  const cs = cards.map(parseCard).filter((c): c is Card => c !== null);
  if (cs.length === 0) return [1];
  return handValue(cs);
}

// Сравнение двух значений cardSetValue: 1 — первое сильнее, -1 — слабее, 0 — дележ.
export function compareValues(a: number[], b: number[]): number {
  return cmp(a, b);
}

// Категория комбинации ПО-РУССКИ + её место в иерархии — готовый факт для промпта (правило 1).
// Зачем: аудит 2026-07-16 показал, что модели путают САМУ КАТЕГОРИЮ («каре» называют фуллом, «две
// пары» — трипсом), хотя состав руки лежит в фактах. Ярлык + место в иерархии убирают у модели
// работу «сообразить, что сильнее», а именно на ней она и валится.
// ⚠️Английский ключ (QUADS/TWO_PAIR) в текст игроку попадать НЕ должен — модель повторит его эхом,
// и латинский сторож забракует весь разбор. Поэтому наружу отдаём только русское.
const CATEGORY_RU: Record<string, { ru: string; place: number }> = {
  STRAIGHT_FLUSH: { ru: "стрит-флеш", place: 1 },
  QUADS: { ru: "каре", place: 2 },
  FULL_HOUSE: { ru: "фулл-хаус", place: 3 },
  FLUSH: { ru: "флеш", place: 4 },
  STRAIGHT: { ru: "стрит", place: 5 },
  TRIPS: { ru: "тройка (сет или трипс)", place: 6 },
  TWO_PAIR: { ru: "две пары", place: 7 },
  PAIR: { ru: "пара", place: 8 },
  HIGH: { ru: "старшая карта", place: 9 },
};

// Русское имя категории и её место сверху (1 = стрит-флеш, 9 = старшая карта). null — ключ неизвестен.
export function madeHandCategoryRu(category: string): { ru: string; place: number } | null {
  return CATEGORY_RU[category] ?? null;
}

export type MadeHand = {
  category: string; // ключ категории (HIGH/PAIR/TWO_PAIR/…) — ВНУТРЕННИЙ, в текст игроку не отдавать
  ru: string; // человеческое описание для промпта
  improves: boolean; // улучшают ли карты Hero категорию борда (иначе «играет борд»)
  // Грубый бакет силы руки для классификации функции ставки (велью/защита/блеф) — единый
  // источник, чтобы action-shape.ts не переопределял тир пары. «Своей пары нет» = AIR.
  strength: "STRONG_MADE" | "STRONG_PAIR" | "MID_PAIR" | "WEAK_PAIR" | "AIR";
};

// Готовая рука Hero по картам + борду (3+ карты). null — префлоп (борда нет).
// subject — ЧЬЯ это рука. Функция зовётся и для руки соперника на вскрытии, а часть описаний
// написана во втором лице («своей пары у ТЕБЯ нет»): на чужой руке это читалось как факт про Hero
// и обе руки выходили слово-в-слово одинаковыми при разном вердикте (аудит румов 19.07).
export function heroMadeHand(
  heroCards: string[],
  board: string[],
  subject: "hero" | "opponent" = "hero",
): MadeHand | null {
  const own = subject === "hero" ? "у тебя" : "у него";
  const hero = heroCards.map(parseCard).filter((c): c is Card => c !== null);
  const boardC = board.map(parseCard).filter((c): c is Card => c !== null);
  if (hero.length < 2 || boardC.length < 3) return null;

  const v7 = handValue([...hero, ...boardC]);
  const vBoard = handValue(boardC);
  const improves = v7[0] > vBoard[0]; // подняли категорию выше, чем у голого борда
  const boardRanks = [...new Set(boardC.map((c) => c.rank))].sort((a, b) => b - a);
  const heroPair = hero.length === 2 && hero[0].rank === hero[1].rank;

  const cat = v7[0];
  let category = "HIGH";
  let ru = "";
  // Сильная готовая (две пары+) — STRONG_MADE; старшая карта без пары — AIR; пары уточняем ниже.
  let strength: MadeHand["strength"] = cat >= 3 ? "STRONG_MADE" : "AIR";

  switch (cat) {
    case 9:
      category = "STRAIGHT_FLUSH";
      ru = "стрит-флеш";
      break;
    case 8:
      category = "QUADS";
      ru = `каре ${GEN_PL[v7[1]]}`;
      break;
    case 7:
      category = "FULL_HOUSE";
      ru = `фулл-хаус (три ${GEN_PL[v7[1]]} + пара ${GEN_PL[v7[2]]})`;
      break;
    case 6:
      category = "FLUSH";
      ru = "флеш";
      break;
    case 5:
      category = "STRAIGHT";
      ru = "стрит";
      break;
    case 4:
      category = "TRIPS";
      ru = heroPair && hero[0].rank === v7[1] ? `сет ${GEN_PL[v7[1]]}` : `трипс ${GEN_PL[v7[1]]}`;
      break;
    case 3:
      category = "TWO_PAIR";
      ru = `две пары (${GEN_PL[v7[1]]} и ${GEN_PL[v7[2]]})`;
      break;
    case 2: {
      category = "PAIR";
      const pr = v7[1];
      if (!improves) {
        ru = `пара ${GEN_PL[pr]} лежит на борде — своей пары ${own} нет, кикер ${SG[v7[2]] ?? "—"}`;
        strength = "AIR"; // пара на борде, своей нет — по силе это воздух
      } else if (heroPair && hero[0].rank === pr) {
        if (pr > boardRanks[0]) {
          ru = `оверпара ${GEN_PL[pr]} (выше борда)`;
          strength = "STRONG_PAIR";
        } else {
          ru = `карманная пара ${GEN_PL[pr]}`;
          strength = pr > (boardRanks[1] ?? 0) ? "MID_PAIR" : "WEAK_PAIR";
        }
      } else {
        const idx = boardRanks.indexOf(pr);
        const tier = idx === 0 ? "топ-пара" : idx === 1 ? "вторая пара" : "слабая пара";
        ru = `${tier} — ${GEN_PL[pr]}`;
        strength = idx === 0 ? "STRONG_PAIR" : idx === 1 ? "MID_PAIR" : "WEAK_PAIR";
      }
      break;
    }
    default:
      category = "HIGH";
      ru = "пары нет, ты не попал в борд (только старшая карта)";
  }

  // Готовая рука «две пары и выше», которую целиком даёт БОРД, а карты Hero её не образуют,
  // — это рука борда, не твоя (реальная сила — кикер или вообще ничего). Для одной пары такой
  // даунгрейд уже сделан в case 2; здесь закрываем две пары/сет/стрит/флеш/фулл, иначе тренеру
  // уходит «у тебя две пары/флеш», которых у Hero фактически нет (борд KK55 + AQ → «две пары»).
  // Критерий точный, чтобы НЕ понизить реальную руку: своя вторая пара (KK55 + QQ), свой
  // туз-флеш (5 треф борда + туз треф) — там карта Hero участвует, и это не «борд».
  if (cat >= 3) {
    const boardByRank = new Map<number, number>();
    for (const c of boardC) boardByRank.set(c.rank, (boardByRank.get(c.rank) ?? 0) + 1);
    let playsBoard = false;
    if (cat === 3) {
      // две пары: играешь борд, только если ОБЕ пары (v7[1], v7[2]) уже спарены на борде
      playsBoard = (boardByRank.get(v7[1]) ?? 0) >= 2 && (boardByRank.get(v7[2]) ?? 0) >= 2;
    } else if (cat === 4) {
      // сет/трипс: играешь борд, только если тройка (v7[1]) уже лежит на борде втроём
      playsBoard = (boardByRank.get(v7[1]) ?? 0) >= 3;
    } else {
      // стрит/флеш/фулл/каре/стрит-флеш: играешь борд, если карты Hero не улучшают руку вовсе
      // (лучшая 5-карточная из 7 в точности равна лучшей из борда) — тогда туз-флеш не понизится
      playsBoard = cmp(v7, vBoard) === 0;
    }
    if (playsBoard) {
      ru = `${ru} - но эта комбинация целиком на борде, своей руки ${own} нет (играешь борд/кикер)`;
      strength = "AIR";
    }
  }

  return { category, ru, improves, strength };
}

// Натсовость готового ФЛЕША/СТРИТА Hero (свип «нат-статус на глаз»): раньше промпт учил модель
// самой считать «флеш от шестёрки - младший, любая старше бьёт», и это неточно (не учитывало
// мёртвые карты). Парсер считает точно: старшая карта флеша Hero и сколько ЖИВЫХ старших карт
// той масти реально осталось у соперников. Возвращает строку-факт или null (не флеш/стрит).
// Что бьёт стрит/флеш ПОВЕРХ его собственной категории (2026-07-17, регресс #8).
// Дыра, из-за которой парсер сам врал: натсовость меряли ВНУТРИ категории — стрит сравнивали
// только со стритами, флеш только с флешами. На борде Kh Jd Td Jc Ad это давало «Твой стрит
// НАТСОВЫЙ», хотя рядом наша же перепись колоды печатала «тебя бьют 60 (каре, 23 фулла, 36
// флешей)». Модель послушно повторяла «натс» — и ловила от нас ярлык галлюцинации; сломались
// ВСЕ ТРИ модели на одной раздаче, что и выдало причину: враньё было в данных, не в модели.
//
// Судья здесь — beatenCount (перебор всей колоды из fullDeckOdds): только он видит и стрит-флеш,
// и фулл, и каре разом. Локально мы лишь ОБЪЯСНЯЕМ причину игроку. Если перебор говорит «бьют»,
// а причину назвать не смогли — всё равно молчим про натс: соврать страшнее, чем не объяснить.
// Карманные пары, которые обходят две пары Hero, когда старшая пара — общая (лежит на борде).
// Соперник с карманкой ранга R (R > младшей пары Hero) держит две пары «R + общая старшая» и
// бьёт Hero по МЛАДШЕЙ паре. Ранг старшей пары пропускаем: карманка того же ранга — это уже
// каре, другая история (её считает перепись колоды). Ранг, которого в колоде осталось меньше
// двух карт, физически не собрать в карманку — не пугаем игрока невозможным.
// Отдаём русские названия: латиница в фактах = эхо модели = брак латинским сторожем.
function killerPocketsRu(heroLow: number, boardTop: number, boardC: Card[]): string {
  const out: string[] = [];
  for (let r = heroLow + 1; r <= 14; r++) {
    if (r === boardTop) continue; // карманка ранга общей пары = каре, не «старшие две пары»
    const onBoard = boardC.filter((c) => c.rank === r).length;
    if (4 - onBoard < 2) continue; // в колоде не осталось пары этого ранга
    out.push(GEN_PL[r]);
  }
  return out.join(", ");
}

// Кто именно бьёт — словами переписи, а не нашей догадкой. Пустая строка, если разбивки нет.
function beatenByRu(odds: DeckOdds): string {
  return odds.losesByCategory.map((c) => c.category).join(", ");
}

// Борд ещё не закрыт (флоп/тёрн) — «сейчас никто не бьёт» ≠ «не побьёт никогда»: на флопе натс
// легко перестаёт им быть к риверу. Утверждать вечность там, где её нет, — то же враньё.
function nutsCaveat(boardC: Card[]): string {
  return boardC.length === 5 ? "" : " на этой улице";
}

export function madeHandNutStatus(
  heroCards: string[],
  board: string[],
  odds: DeckOdds | null,
): string | null {
  // Нет переписи — про натс молчим совсем: «лучший в своей категории» и «непобедим» не одно и
  // то же, а отличить их без перебора нечем. Молчание дешевле вранья в любую сторону.
  const verified = odds != null;
  const isNuts = verified && odds.losesTo === 0;
  const beaten = verified && odds.losesTo > 0 ? beatenByRu(odds) : "";
  const hero = heroCards.map(parseCard).filter((c): c is Card => c !== null);
  const boardC = board.map(parseCard).filter((c): c is Card => c !== null);
  if (hero.length < 2 || boardC.length < 3) return null;
  const all = [...hero, ...boardC];
  const mh = heroMadeHand(heroCards, board);
  if (!mh) return null;
  // Рука целиком на борде (играет борд/кикер) — натсовость не про руку Hero, молчим (согласовано
  // с даунгрейдом «играешь борд»): легитимный флеш/стрит Hero всегда STRONG_MADE.
  if (mh.strength === "AIR") return null;

  if (mh.category === "FLUSH") {
    const bySuit = new Map<string, Card[]>();
    for (const c of all) {
      const a = bySuit.get(c.suit) ?? [];
      a.push(c);
      bySuit.set(c.suit, a);
    }
    let flushSuit: string | null = null;
    for (const [s, cs] of bySuit) if (cs.length >= 5) flushSuit = s;
    if (!flushSuit) return null;
    const heroInSuit = hero.filter((c) => c.suit === flushSuit);
    if (heroInSuit.length === 0) return null; // флеш целиком на борде
    const suitRanks = new Set(bySuit.get(flushSuit)!.map((c) => c.rank));
    // Натсовость меряем по СОБСТВЕННОЙ старшей карте Hero: всё, что выше на борде, общее и бьёт
    // тебя, если у соперника есть эта масть. Считать от старшей карты флеша (борда) — та ошибка,
    // из-за которой младший флеш ложно назывался «натсовым» (туз масти на борде).
    const heroTop = Math.max(...heroInSuit.map((c) => c.rank));
    const topOfFlush = Math.max(...suitRanks);
    let higherLive = 0; // живые карты масти ВЫШЕ личной старшей Hero (не в игре)
    for (let r = 14; r > heroTop; r--) if (!suitRanks.has(r)) higherLive++;
    if (higherLive === 0) {
      // Натсовость флеша меряли ВНУТРИ масти — но флеш бьют фулл-хаус, каре и стрит-флеш.
      // Правду знает только перебор колоды; локальным взглядом её не собрать.
      if (isNuts)
        return `Твой флеш НАТСОВЫЙ${nutsCaveat(boardC)} (старшая твоя карта ${SG[heroTop]}) - тебя не бьёт ничто.`;
      if (beaten)
        return `Твой флеш лучший в своей масти (твоя старшая ${SG[heroTop]}), но это НЕ натс: тебя бьют ${beaten}. Непобедимым его не называй, крупный банк строй осторожно.`;
      return `Твой флеш лучший в своей масти (твоя старшая ${SG[heroTop]}).`;
    }
    const boardHigher = topOfFlush > heroTop ? ` (до ${GEN_SG[topOfFlush]} флеш общий - с борда)` : "";
    return `Сила флеша: твоя старшая карта в нём ${SG[heroTop]}${boardHigher} - НЕ натс: выше неё в этой масти ещё ${higherLive} живых карт, любая у соперника даёт флеш старше. Крупный банк строй осторожно.`;
  }

  if (mh.category === "STRAIGHT") {
    const straightHigh = cardSetValue([...heroCards, ...board])[1];
    // Достижим ли на этом борде СТАРШИЙ стрит: для каждого high выше нашего считаем, сколько из
    // 5 его рангов уже на борде; если ≥3 — соперник добирает 2 карты и делает стрит выше.
    const boardRanks = new Set(boardC.map((c) => c.rank));
    const hasR = (r: number) => boardRanks.has(r) || (r === 1 && boardRanks.has(14));
    let maxHigh = straightHigh;
    for (let high = 14; high > straightHigh; high--) {
      let onBoard = 0;
      for (let k = 0; k < 5; k++) hasR(high - k) && onBoard++;
      if (onBoard >= 3) {
        maxHigh = high;
        break;
      }
    }
    if (maxHigh <= straightHigh) {
      // Тот же капкан, что у флеша: старшего СТРИТА не собрать — но стрит бьют флеш, фулл и каре.
      if (isNuts)
        return `Твой стрит НАТСОВЫЙ${nutsCaveat(boardC)} (до ${GEN_SG[straightHigh]}) - тебя не бьёт ничто.`;
      if (beaten)
        return `Твой стрит старший на этом борде (до ${GEN_SG[straightHigh]}), но это НЕ натс: тебя бьют ${beaten}. Непобедимым его не называй, крупный банк строй осторожно.`;
      return `Твой стрит старший на этом борде (до ${GEN_SG[straightHigh]}).`;
    }
    return `Сила стрита: он до ${GEN_SG[straightHigh]}, но на борде возможен старший (до ${GEN_SG[maxHigh]}), если у соперника карты выше. Крупный банк строй осторожно.`;
  }

  // Фулл-хаус, каре и стрит-флеш раньше не получали НИ ОДНОЙ строки про натсовость (падали в
  // null) — и вакуум модель заполняла сама, «на тёрне у тебя была натсовая рука» при живом каре.
  // Печатаем только ОТРИЦАНИЕ: когда рука реально натс, это уже сказано строкой «тебя бьют 0 из
  // N» — второй раз за те же токены не платим.
  if (mh.category === "FULL_HOUSE" || mh.category === "QUADS" || mh.category === "STRAIGHT_FLUSH") {
    if (!beaten) return null;
    const ru = madeHandCategoryRu(mh.category)?.ru ?? "рука";
    return `Твой ${ru} - НЕ натс: тебя бьют ${beaten}. Рука очень сильная, но непобедимой её не называй.`;
  }

  return null;
}

// Суб-бакет STRONG_MADE (свип «велью на глаз»): раньше сила две-пары..каре схлопывалась в один
// ярлык «VALUE, добирает с того, что слабее». Здесь парсер отдаёт СТРУКТУРНЫЙ факт «где твоя
// сильная рука в иерархии этого борда» — БЕЗ слова «велью» (велью = есть кто слабее И заплатит,
// а «заплатит» зависит от типа соперника = рид, остаётся модели). Покрываем сет/трипс (топ или
// нет) и две пары (уязвимы сету/старшим двум парам). Флеш/стрит — в madeHandNutStatus, фулл+ — в
// boardDangerFacts (не дублируем). null — не сет/трипс/две-пары или рука на борде (AIR).
export function madeHandVulnerability(heroCards: string[], board: string[]): string | null {
  const boardC = board.map(parseCard).filter((c): c is Card => c !== null);
  if (heroCards.length < 2 || boardC.length < 3) return null;
  const mh = heroMadeHand(heroCards, board);
  if (!mh || mh.strength === "AIR") return null;
  const v = cardSetValue([...heroCards, ...board]);
  const boardRanks = [...new Set(boardC.map((c) => c.rank))].sort((a, b) => b - a);

  if (mh.category === "TRIPS") {
    const tripRank = v[1];
    // Сет = карманная пара Hero (обе карты = tripRank). Трипс = одна карта Hero + пара на борде.
    // Настоящий сет ⟹ борд НЕ спарен по другой карте (иначе фулл/каре, не эта ветка).
    const heroRanks = heroCards
      .map(parseCard)
      .filter((c): c is Card => c !== null)
      .map((c) => c.rank);
    const isSet = heroRanks.filter((r) => r === tripRank).length >= 2;
    if (!isSet) {
      // Трипс: пара tripRank лежит на борде → доска спарена по определению, фулл уже возможен.
      return `Твой трипс ${GEN_PL[tripRank]} - одна карта твоя, пара на борде: доска спарена, оверпара или старшая карта борда у соперника даёт ему фулл, а против другого трипса решает кикер. Не путать с сетом.`;
    }
    const higher = boardRanks.filter((r) => r > tripRank);
    if (higher.length === 0)
      return `Твой сет ${GEN_PL[tripRank]} - ТОП-сет (старших карт на борде нет), очень сильная рука; уступает только флешу или стриту по текстуре борда.`;
    return `Твой сет ${GEN_PL[tripRank]} - НЕ топ: на борде старше ${higher.map((r) => SG[r]).join(", ")}. Соперник с парой такой карты держит СТАРШИЙ сет, оверпара тоже впереди - рука сильная, но не натсовая.`;
  }

  if (mh.category === "TWO_PAIR") {
    // Если старшая из двух пар СПАРЕНА на борде (общая) - это не преимущество Hero: спор идёт
    // по МЛАДШЕЙ паре (ровно инцидент 66 vs JJ на QQ432 - дамы общие, решают шестёрки/валеты).
    const topOnBoard = boardC.filter((c) => c.rank === v[1]).length >= 2;
    if (topOnBoard) {
      // Регресс #5/#13 (17.07), ДВЕ волны правок — история важна, чтобы не откатили.
      // Правило «любая карманка старше твоей младшей пары бьёт тебя» было ВЕРНЫМ, но абстрактным:
      // модель его не ПРИМЕНЯЛА. На 96o (борд 4-5-7-6-7) тренер заявил «ты бьёшь 88 или 99» и на
      // этом потребовал колла; игрок сам назвал 88/99 верно — тренер переубедил его враньём.
      // Первая правка (список карманок) вылечила #5, но НЕ #13: там тренер продолжил звать «валет
      // или десятку» руками, которые Hero бьёт. Причина — модель не понимает, что на борде
      // T-5-J-T-4 «рука с валетом» это НЕ валет-хай, а ДВЕ ПАРЫ (валет спаривается с бордовым),
      // а «рука с десяткой» — вообще ТРИПС. Одиночные карты борда опаснее карманок, и про них
      // факта не было вовсе. Поэтому перечисляем ВСЕ три источника угрозы прямым текстом.
      // ⚠️Ранги ТОЛЬКО по-русски: «TT/JJ/QQ» модель скопирует эхом → латинский сторож забракует
      // весь разбор (уже горели на VPIP — 7 браков из 15).
      const threats: string[] = [];
      // 1. Одна карта ранга ОБЩЕЙ пары → трипс. Самая сильная и незаметная для модели угроза.
      if (4 - boardC.filter((c) => c.rank === v[1]).length >= 1)
        threats.push(`любая рука с ${INS_SG[v[1]]} (у него ТРИПС ${GEN_PL[v[1]]})`);
      // 2. Одна карта борда между парами → старшие две пары (вторая карта уже на борде).
      const overLow = boardRanks.filter((r) => r > v[2] && r !== v[1]);
      for (const r of overLow)
        threats.push(`любая рука с ${INS_SG[r]} (у него две пары ${GEN_PL[r]} и ${GEN_PL[v[1]]} - старше твоих)`);
      // 3. Карманные пары старше младшей пары Hero.
      const killers = killerPocketsRu(v[2], v[1], boardC);
      if (killers) threats.push(`карманная пара любого из рангов: ${killers}`);
      const threatNote = threats.length ? ` Тебя бьют: ${threats.join("; ")}.` : "";
      return `Две пары (${GEN_PL[v[1]]} и ${GEN_PL[v[2]]}), но старшая пара (${GEN_PL[v[1]]}) - на борде, общая: спор идёт по МЛАДШЕЙ паре (${GEN_PL[v[2]]}), и старшая пара тебе НЕ помогает - она есть у КАЖДОГО.${threatNote} Все они тебя ОБХОДЯТ, а не проигрывают тебе.`;
    }
    const overs = boardRanks.filter((r) => r > v[1]);
    const note =
      overs.length > 0
        ? ` На борде старше твоих пар: ${overs.map((r) => SG[r]).join(", ")} - соперник с такой парой держит старшие две пары или сет.`
        : "";
    return `Две пары (${GEN_PL[v[1]]} и ${GEN_PL[v[2]]}) - сильно, но НЕ натс: бьются сетом и старшими двумя парами.${note}`;
  }

  return null;
}

// Кикер-доминирование СВОЕЙ пары (свип: 72 на 7K4 - двойка бита любым 7x). Для одной пары,
// собранной картой Hero + картой борда, кикер (вторая карта Hero) решает при равной паре у
// соперника. Парсер считает, сколько ЖИВЫХ старших рангов дало бы ту же пару со старшим кикером -
// иначе модель зовёт доминируемую пару «пригодной», не видя доминирования. null - не «своя» пара
// (карманная/оверпара кикером не решается; пара на борде - AIR; две пары+ - другая иерархия), или
// кикер уже топовый, или старший кикер УЖЕ общий на борде (тогда играет карта борда, не твоя).
export function madeHandKicker(heroCards: string[], board: string[]): string | null {
  const boardC = board.map(parseCard).filter((c): c is Card => c !== null);
  if (heroCards.length < 2 || boardC.length < 3) return null;
  const mh = heroMadeHand(heroCards, board);
  // Только своя пара с картой борда (кикер играет): топ/вторая/слабая пара. Оверпара и карманная
  // пара - обе карты Hero одного ранга, кикер не решает. AIR (пара на борде) - своей нет.
  if (!mh || mh.category !== "PAIR") return null;
  if (mh.strength !== "STRONG_PAIR" && mh.strength !== "MID_PAIR" && mh.strength !== "WEAK_PAIR") return null;
  const hero = heroCards.map(parseCard).filter((c): c is Card => c !== null);
  if (hero.length < 2 || hero[0].rank === hero[1].rank) return null; // карманную отсекли
  const v = cardSetValue([...heroCards, ...board]);
  const pr = v[1]; // ранг пары
  const kicker = hero.find((c) => c.rank !== pr);
  if (!kicker) return null;
  const kr = kicker.rank;
  const boardRanks = new Set(boardC.map((c) => c.rank));
  // Раньше молчали, если на борде есть карта старше кикера («первый кикер общий»). Но ревью
  // показало (K7 на K-Q-4): даже когда СТАРШИЙ кикер общий с борда, ВТОРОЙ кикер решает - KJ/KT/K9/K8
  // бьют K7. Доминаторы = живые ранги старше кикера Hero (не pr, не на борде) - они верны в любом
  // случае: заменяют кикер Hero в 5-карточной руке соперника с той же парой.
  // Живые ранги старше кикера: каждый = соперник с той же парой, но старшим кикером.
  const higher: number[] = [];
  for (let r = kr + 1; r <= 14; r++) {
    if (r === pr || boardRanks.has(r)) continue;
    higher.push(r);
  }
  if (higher.length === 0)
    return `Кикер к паре ${GEN_PL[pr]} - ${SG[kr]}, топовый: старше живых карт нет, по кикеру тебя не перебить.`;
  const top = higher
    .slice()
    .reverse()
    .slice(0, 3)
    .map((r) => SG[r])
    .join("/");
  return `Кикер к паре ${GEN_PL[pr]} - ${SG[kr]}, доминируется: у соперника с такой же парой ${GEN_PL[pr]}, но кикером ${top} (и др.) рука впереди. Пара пригодна, но при равной паре решает кикер - не переоценивай.`;
}

const SUIT_RU: Record<string, string> = { c: "треф", d: "бубён", h: "черв", s: "пик" };

// Постфлоп-блокер к НАТС-флешу соперника (свип, кандидат 3): на борде 3+ одной масти (флеш-угроза),
// своего флеша у Hero нет, но он держит СТАРШУЮ живую карту масти → натсовый флеш у соперника
// невозможен. Важна осторожная подача: это БЛОКЕР (флеша у Hero нет), а НЕ «ты впереди» - иначе
// модель качнётся в безрассудство (промпт при монотоне толкает фолдить, не зная про блокер).
// Только полный блок (Hero держит топ живую карту масти); частичный не показываем (шум). Правило 1.
export function nutFlushBlocker(heroCards: string[], board: string[]): string | null {
  const hero = heroCards.map(parseCard).filter((c): c is Card => c !== null);
  const boardC = board.map(parseCard).filter((c): c is Card => c !== null);
  if (hero.length < 2 || boardC.length < 3) return null;
  for (const suit of ["c", "d", "h", "s"]) {
    const boardSuit = boardC.filter((c) => c.suit === suit);
    if (boardSuit.length < 3) continue; // нет флеш-угрозы этой масти
    const heroSuit = hero.filter((c) => c.suit === suit);
    if (heroSuit.length === 0) continue; // масть не держит - не блокер
    if (heroSuit.length + boardSuit.length >= 5) continue; // Hero сам собрал флеш (nutStatus покрывает)
    const heroTop = Math.max(...heroSuit.map((c) => c.rank));
    const boardRanks = new Set(boardSuit.map((c) => c.rank));
    // есть ли ЖИВАЯ старшая карта масти, которой Hero НЕ держит и нет на борде (= старший флеш возможен)?
    let higherLive = false;
    for (let r = heroTop + 1; r <= 14; r++) {
      if (boardRanks.has(r)) continue; // на борде — общая, не даёт сопернику флеш
      if (heroSuit.some((c) => c.rank === r)) continue; // у Hero
      higherLive = true;
      break;
    }
    if (higherLive) continue; // не топ-блокер: старший флеш у соперника ещё возможен
    return `На борде ${boardSuit.length} ${SUIT_RU[suit]} (флеш-угроза), а ты держишь ${SG[heroTop]} ${SUIT_RU[suit]} - старшую живую карту масти: натсовый флеш у соперника заблокирован, самых сильных флешей у него меньше. Это БЛОКЕР (своего флеша у тебя нет), а не «ты впереди».`;
  }
  return null;
}

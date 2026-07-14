// Детерминированный определитель ГОТОВОЙ руки Hero (правило 1: комбинацию считает
// парсер, не LLM). Дешёвые модели путали пару/две пары/фулл и «выдумывали попадание»
// именно потому, что состав руки им не давали — этот модуль закрывает дыру.
//
// Здесь только точная арифметика рангов и мастей по картам Hero + борду. Никаких
// чартов и эквити против диапазона (их сознательно оставляем модели — см. facts.ts).

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

export type MadeHand = {
  category: string; // ключ категории (HIGH/PAIR/TWO_PAIR/…)
  ru: string; // человеческое описание для промпта
  improves: boolean; // улучшают ли карты Hero категорию борда (иначе «играет борд»)
  // Грубый бакет силы руки для классификации функции ставки (велью/защита/блеф) — единый
  // источник, чтобы action-shape.ts не переопределял тир пары. «Своей пары нет» = AIR.
  strength: "STRONG_MADE" | "STRONG_PAIR" | "MID_PAIR" | "WEAK_PAIR" | "AIR";
};

// Готовая рука Hero по картам + борду (3+ карты). null — префлоп (борда нет).
export function heroMadeHand(heroCards: string[], board: string[]): MadeHand | null {
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
        ru = `пара ${GEN_PL[pr]} лежит на борде — своей пары у тебя нет, кикер ${SG[v7[2]] ?? "—"}`;
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
      ru = `${ru} - но эта комбинация целиком на борде, своей руки у тебя нет (играешь борд/кикер)`;
      strength = "AIR";
    }
  }

  return { category, ru, improves, strength };
}

// Натсовость готового ФЛЕША/СТРИТА Hero (свип «нат-статус на глаз»): раньше промпт учил модель
// самой считать «флеш от шестёрки - младший, любая старше бьёт», и это неточно (не учитывало
// мёртвые карты). Парсер считает точно: старшая карта флеша Hero и сколько ЖИВЫХ старших карт
// той масти реально осталось у соперников. Возвращает строку-факт или null (не флеш/стрит).
export function madeHandNutStatus(heroCards: string[], board: string[]): string | null {
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
    if (higherLive === 0)
      return `Твой флеш НАТСОВЫЙ (старшая твоя карта ${SG[heroTop]}) - старше в этой масти живых карт нет, никто не бьёт.`;
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
    if (maxHigh <= straightHigh)
      return `Твой стрит НАТСОВЫЙ (до ${GEN_SG[straightHigh]}) - старше на этом борде не собрать.`;
    return `Сила стрита: он до ${GEN_SG[straightHigh]}, но на борде возможен старший (до ${GEN_SG[maxHigh]}), если у соперника карты выше. Крупный банк строй осторожно.`;
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
      const overLow = boardRanks.filter((r) => r > v[2] && r !== v[1]);
      const lowNote =
        overLow.length > 0
          ? ` На борде между парами: ${overLow.map((r) => SG[r]).join(", ")} - карманка такого ранга даёт сопернику старшие две пары.`
          : "";
      return `Две пары (${GEN_PL[v[1]]} и ${GEN_PL[v[2]]}), но старшая пара (${GEN_PL[v[1]]}) - на борде, общая: спор идёт по МЛАДШЕЙ паре (${GEN_PL[v[2]]}). Любая карманка старше твоей младшей пары или своя старшая карта борда бьёт тебя.${lowNote}`;
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

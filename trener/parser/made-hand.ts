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

  return { category, ru, improves, strength };
}

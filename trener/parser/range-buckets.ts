import { cardSetValue, compareValues, handCategory } from "./made-hand";

// Бакетизация ОТМЕЧЕННОГО игроком диапазона соперника на конкретном борде: сколько комбо
// Hero БЬЁТ, сколько бьют его, и - главное - из тех, что Hero бьёт, сколько ЗАПЛАТЯТ велью-
// бет (есть пара+), а сколько СБРОСЯТ (воздух). Это точная проверка намерения: сказал
// «ставлю на велью», а worsePays ≈ 0 - значит велью нет, это блеф. Правило 1: сравнение
// рук считает парсер тем же эвалюатором. Диапазон называет игрок (сетка), арифметику - код.

const SUITS = ["c", "d", "h", "s"];
const norm = (c: string) => (c[0]?.toUpperCase() ?? "") + (c[1]?.toLowerCase() ?? "");

function codeToCombos(code: string): string[][] {
  const r1 = code[0], r2 = code[1];
  const out: string[][] = [];
  if (code.length === 2) {
    if (r1 !== r2) return []; // двухсимвольный код - только пара (напр. «AQ» без s/o битый)
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) out.push([r1 + SUITS[i], r1 + SUITS[j]]);
  } else if (code[2] === "s") {
    for (const s of SUITS) out.push([r1 + s, r2 + s]);
  } else {
    for (const s1 of SUITS) for (const s2 of SUITS) if (s1 !== s2) out.push([r1 + s1, r2 + s2]);
  }
  return out;
}

export type RangeBuckets = {
  total: number; // живых комбо диапазона (после вычета мёртвых карт)
  beats: number; // комбо, которые Hero бьёт (он впереди)
  losesTo: number; // комбо, которые бьют Hero (он позади)
  ties: number;
  worsePays: number; // из beats: имеют пару+ на борде → заплатят велью-бет
  worseAir: number; // из beats: воздух (нет пары) → сбросят на бет
};

export function rangeBuckets(heroCards: string[], board: string[], codes: string[]): RangeBuckets | null {
  if (heroCards.length !== 2 || board.length < 3 || board.length > 5 || codes.length === 0) return null;
  const dead = new Set([...heroCards, ...board].map(norm));
  if (dead.size !== heroCards.length + board.length) return null; // дубль карт - кривой вход

  const heroVal = cardSetValue([...heroCards, ...board]);
  let total = 0, beats = 0, losesTo = 0, ties = 0, worsePays = 0, worseAir = 0;
  const seen = new Set<string>();

  for (const code of codes) {
    for (const [a, b] of codeToCombos(code)) {
      const na = norm(a), nb = norm(b);
      if (dead.has(na) || dead.has(nb)) continue; // задета карта Hero/борда
      const key = [na, nb].sort().join("-");
      if (seen.has(key)) continue;
      seen.add(key);
      total++;

      const cmp = compareValues(heroVal, cardSetValue([a, b, ...board]));
      if (cmp > 0) {
        beats++;
        if (handCategory([a, b, ...board]) >= 2) worsePays++; // пара+ → заплатит велью
        else worseAir++; // воздух → сбросит
      } else if (cmp < 0) {
        losesTo++;
      } else {
        ties++;
      }
    }
  }

  if (total === 0) return null;
  return { total, beats, losesTo, ties, worsePays, worseAir };
}

// Категории бьющих рук по числу из cardSetValue[0] (для разбивки losesTo). Игроку тренер переводит
// простыми словами; здесь — внутренний факт для модели, чтобы понимала СТРУКТУРУ угрозы.
// ⚠️Ключи обязаны покрывать ВСЕ категории cardSetValue[0] (2..9): фильтр ниже молча выбрасывает
// то, чего здесь нет. Стрит-флеша не было — и самая страшная угроза пропадала из разбивки, а
// сумма категорий переставала сходиться с losesTo (найдено на разборе регресса #8, 2026-07-17).
const CAT_RU: Record<number, string> = {
  9: "стрит-флеши",
  8: "каре",
  7: "фулл-хаусы",
  6: "флеши",
  5: "стриты",
  4: "тройки (сеты/трипсы)",
  3: "две пары",
  2: "старшие пары",
};

export type DeckOdds = {
  total: number; // всех живых 2-карточных комбо соперника из колоды
  beats: number; // Hero бьёт
  losesTo: number; // бьют Hero
  ties: number;
  losesByCategory: { category: string; count: number }[]; // разбивка losesTo по силе бьющей руки
  heroBeatsValue: boolean; // Hero бьёт хоть одну «не-воздух» руку соперника (пара+) — не чистый блеф-кэтчер
};

// Полнодечная перепись (свип + запрос Артёма): сколько ВООБЩЕ физически возможных рук соперника
// бьют готовую руку Hero на этом борде, с разбивкой по силе. Это НЕ диапазон конкретного соперника
// (он вошёл бы не со всем) и НЕ вскрытые карты — честный СТРУКТУРНЫЙ якорь «сколько способов тебя
// обойти существует». Обобщает rangeBuckets с отмеченной сетки на всю живую колоду. Правило 1:
// сравнение — тот же эвалюатор. ~C(47,2)≈1080 сравнений на улицу — дёшево (как drawEquity).
export function fullDeckOdds(heroCards: string[], board: string[]): DeckOdds | null {
  if (heroCards.length !== 2 || board.length < 3 || board.length > 5) return null;
  const dead = new Set([...heroCards, ...board].map(norm));
  if (dead.size !== heroCards.length + board.length) return null;

  const RANKS = "23456789TJQKA";
  const deck: string[] = [];
  for (const r of RANKS) for (const s of SUITS) if (!dead.has(norm(r + s))) deck.push(r + s);

  const heroVal = cardSetValue([...heroCards, ...board]);
  let total = 0,
    beats = 0,
    losesTo = 0,
    ties = 0,
    heroBeatsValue = false;
  const byCat = new Map<number, number>();

  for (let i = 0; i < deck.length; i++) {
    for (let j = i + 1; j < deck.length; j++) {
      total++;
      const oppVal = cardSetValue([deck[i], deck[j], ...board]);
      const cmp = compareValues(heroVal, oppVal);
      if (cmp > 0) {
        beats++;
        if (oppVal[0] >= 2) heroBeatsValue = true; // бьёт руку с парой+ = не чистый блеф-кэтчер
      } else if (cmp < 0) {
        losesTo++;
        byCat.set(oppVal[0], (byCat.get(oppVal[0]) ?? 0) + 1);
      } else {
        ties++;
      }
    }
  }
  if (total === 0) return null;

  const losesByCategory = [...byCat.entries()]
    .filter(([cat]) => CAT_RU[cat])
    .sort((a, b) => b[0] - a[0]) // от сильных к слабым
    .map(([cat, count]) => ({ category: CAT_RU[cat], count }));

  return { total, beats, losesTo, ties, losesByCategory, heroBeatsValue };
}

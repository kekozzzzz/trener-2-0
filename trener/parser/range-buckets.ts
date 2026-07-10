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

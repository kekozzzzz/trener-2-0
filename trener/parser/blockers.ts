// Мелкая детерминированная арифметика: счётчик блокеров и MDF. Правило 1: числа - парсер.

const SUITS = ["c", "d", "h", "s"];
const norm = (c: string) => (c[0]?.toUpperCase() ?? "") + (c[1]?.toLowerCase() ?? "");

function codeToCombos(code: string): string[][] {
  const r1 = code[0], r2 = code[1];
  const out: string[][] = [];
  if (code.length === 2) {
    if (r1 !== r2) return []; // битый двухсимвольный код (не пара)
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) out.push([r1 + SUITS[i], r1 + SUITS[j]]);
  } else if (code[2] === "s") {
    for (const s of SUITS) out.push([r1 + s, r2 + s]);
  } else {
    for (const s1 of SUITS) for (const s2 of SUITS) if (s1 !== s2) out.push([r1 + s1, r2 + s2]);
  }
  return out;
}

export type BlockerInfo = { code: string; total: number; blocked: number; remaining: number };

// Сколько комбо каждого кода режут карты Hero (напр. туз в руке режет AA/AK соперника) -
// для рестила/блеф-фрейминга: чем больше режешь сильных комбо, тем реже он реально силён.
export function blockerCount(heroCards: string[], codes: string[]): BlockerInfo[] {
  const dead = new Set(heroCards.map(norm));
  return codes.map((code) => {
    const combos = codeToCombos(code);
    const blocked = combos.filter(([a, b]) => dead.has(norm(a)) || dead.has(norm(b))).length;
    return { code, total: combos.length, blocked, remaining: combos.length - blocked };
  });
}

// MDF - минимальная доля диапазона, которую надо защитить против бета, чтобы соперник не
// эксплуатировал блефом: 1 - bet/(pot+bet), в целых %.
export function mdf(betSize: number, pot: number): number {
  if (pot + betSize <= 0) return 0;
  return Math.round((1 - betSize / (pot + betSize)) * 100);
}

// Порог колла с поправкой на БАУНТИ: toCall/(pot+toCall+bounty), в целых %. Голова
// субсидирует колл → порог ниже обычных пот-оддсов. Считать ТОЛЬКО когда известно, что
// турнир баунти И сумма головы реально есть (иначе - обычные пот-оддсы). Извлечение суммы
// из HH - отдельная работа по парсерам румов (эта функция - только арифметика).
export function bountyAdjustedCallPct(toCall: number, pot: number, bounty: number): number {
  const denom = pot + toCall + Math.max(bounty, 0);
  if (denom <= 0) return 0;
  return Math.round((toCall / denom) * 100);
}

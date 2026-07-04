import type { Street, TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { cardSetValue, compareValues } from "./made-hand";

// Детектор доезда (план 2026-07-04-критические-по-доезду): Hero выиграл раздачу,
// но в момент своего крупного постфлоп-вложения был далеко позади ПОКАЗАННОЙ на
// вскрытии руки соперника — «повезло, а не сыграл». Такие раздачи заслуживают
// сократовского диалога наравне с дорогими потерями: результат ≠ качество решения.
//
// Правило 1: карты соперника даёт парсер (вскрытие из HH), эквити — честный перебор
// оставшихся карт борда (тот же эвалюатор made-hand, что у range-equity). Это
// СЕЛЕКТОР кандидатов, не вердикт: колл с дро по цене может быть верным — но у
// живого дро эквити как раз выше порога; вторая пара без аутов — попадёт.

// Порог «был далеко позади»: меньше трети — даже прямые оддсы почти никогда не
// оправдывают крупное вложение, и это заведомо не флип (не судим монетки).
const LUCKY_WIN_EQUITY_MAX = 33;

// Существенное вложение: не мелкий блок-бет, а решение за заметную часть стека.
const SIGNIFICANT_BB = 5; // минимум в больших блайндах…
const SIGNIFICANT_STACK_SHARE = 0.1; // …и не меньше десятой части стартового стека

const CONTINUE_ACTIONS = new Set(["CALL", "RAISE", "ALL_IN", "BET"]);
const STREET_BOARD_LEN: Record<Street, number> = { PREFLOP: 0, FLOP: 3, TURN: 4, RIVER: 5 };

// Эквити Hero против КОНКРЕТНОЙ руки соперника на данном борде, перебором всех
// доборов до 5 карт. Ривер — прямое сравнение. Ничья = полэквити.
export function equityVsHand(hero: string[], villain: string[], board: string[]): number | null {
  if (hero.length !== 2 || villain.length !== 2) return null;
  const dead = new Set([...hero, ...villain, ...board]);
  if (dead.size !== hero.length + villain.length + board.length) return null; // дубль карты — кривой вход

  const deck: string[] = [];
  for (const r of ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"]) {
    for (const s of ["c", "d", "h", "s"]) {
      const card = r + s;
      if (!dead.has(card)) deck.push(card);
    }
  }

  let wins = 0;
  let ties = 0;
  let total = 0;
  const need = 5 - board.length;

  const score = (fullBoard: string[]) => {
    const h = cardSetValue([...hero, ...fullBoard]);
    const v = cardSetValue([...villain, ...fullBoard]);
    const c = compareValues(h, v);
    total += 1;
    if (c > 0) wins += 1;
    else if (c === 0) ties += 1;
  };

  if (need <= 0) {
    score(board.slice(0, 5));
  } else if (need === 1) {
    for (const c of deck) score([...board, c]);
  } else if (need === 2) {
    for (let i = 0; i < deck.length; i++)
      for (let j = i + 1; j < deck.length; j++) score([...board, deck[i], deck[j]]);
  } else {
    return null; // префлоп сознательно не считаем (см. план) — детектор постфлопный
  }

  if (total === 0) return null;
  return Math.round(((wins + ties / 2) / total) * 1000) / 10;
}

export type LuckyWin = {
  street: Street; // улица крупного вложения, где Hero был позади
  equityPct: number; // его эквити в тот момент против вскрытой руки
};

export function detectHeroLuckyWin(snapshot: TableSnapshot): LuckyWin | null {
  const hero = snapshot.heroCards;
  if (!hero || hero.length !== 2) return null;
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb) return null;
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat) return null;

  const shown = snapshot.seats.filter((s) => s.label !== "Hero" && s.shownCards?.length === 2);
  if (shown.length === 0) return null;

  const minAmount = Math.max(SIGNIFICANT_BB * bb, heroSeat.startingStack * SIGNIFICANT_STACK_SHARE);

  // Последнее существенное добровольное вложение Hero на постфлопе — самая поздняя
  // точка, где он ещё решал; борд на тот момент известен по улице действия.
  let decision: { street: Street; boardLen: number } | null = null;
  for (const a of snapshot.actions) {
    if (a.actor !== "Hero" || a.street === "PREFLOP") continue;
    if (!CONTINUE_ACTIONS.has(a.action)) continue;
    if ((a.amount ?? 0) < minAmount) continue;
    decision = { street: a.street, boardLen: STREET_BOARD_LEN[a.street] };
  }
  if (!decision) return null;

  const boardThen = snapshot.board.slice(0, decision.boardLen);
  if (boardThen.length !== decision.boardLen) return null;

  // Против нескольких вскрытых рук берём худший для Hero случай (минимум эквити).
  let minEquity: number | null = null;
  for (const seat of shown) {
    const eq = equityVsHand(hero, seat.shownCards!, boardThen);
    if (eq === null) continue;
    if (minEquity === null || eq < minEquity) minEquity = eq;
  }
  if (minEquity === null || minEquity >= LUCKY_WIN_EQUITY_MAX) return null;

  return { street: decision.street, equityPct: minEquity };
}

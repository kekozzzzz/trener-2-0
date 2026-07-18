import type { TableAction, TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { handCode } from "@/config/poker/hand-codes";
import { FORCED_PREFLOP_ALLIN_RANGE } from "@/config/poker/forced-preflop-allin";

// Детектор ФОРСИРОВАННОГО ПРЕФЛОП-ОЛЛ-ИНА премиум-рукой (Артём 18.07): всё существенное
// вложение Hero — на префлопе, постфлоп-РЕШЕНИЙ не было (карты просто доехали до вскрытия).
// Разбирать нечего: с AK/тузами выставляешься не думая. Такой проигрыш уходит в кулеры, а не
// в «Стоит обсудить». Постфлоп теми же руками (рейзы на тёрне/ривере, где надо было сдаться под
// сет/две пары, а ты «не почувствовал руку») сюда НЕ попадает — любое добровольное постфлоп-
// действие Hero сразу возвращает false, и раздача остаётся кандидатом в разбор.
//
// Правило 1: карты и суммы даёт парсер; список премиум-рук — конфиг (forced-preflop-allin.ts).

const SIGNIFICANT_BB = 5;
const SIGNIFICANT_STACK_SHARE = 0.1;
const CONTINUE_ACTIONS = new Set<TableAction["action"]>(["CALL", "BET", "RAISE", "ALL_IN"]);

export function isForcedPreflopAllIn(snapshot: TableSnapshot): boolean {
  const hero = snapshot.heroCards;
  const code = hero && hero.length === 2 ? handCode(hero) : null;
  if (!code || !FORCED_PREFLOP_ALLIN_RANGE.has(code)) return false;

  const bb = bigBlindFromSnapshot(snapshot);
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!bb || !heroSeat) return false;
  const minAmount = Math.max(SIGNIFICANT_BB * bb, heroSeat.startingStack * SIGNIFICANT_STACK_SHARE);

  let bigPreflopCommit = false;
  for (const a of snapshot.actions) {
    if (a.actor !== "Hero" || !CONTINUE_ACTIONS.has(a.action)) continue;
    // Любое добровольное постфлоп-действие = было постфлоп-решение → это НЕ форс, разбираем.
    if (a.street !== "PREFLOP") return false;
    if (a.action === "ALL_IN" || (a.amount ?? 0) >= minAmount) bigPreflopCommit = true;
  }
  return bigPreflopCommit;
}

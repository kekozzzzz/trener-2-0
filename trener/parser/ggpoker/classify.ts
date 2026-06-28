import type { HandImportance, ParsedHandSnapshot, PlayerStyle, TableAction } from "../types";

// Потолок критических раздач (каждая ведёт сократовский диалог «почему»). Число адаптивное:
// берём все спорные потери, отсортированные по размеру, но не больше потолка. 7 — запас под
// турниры-катастрофы (сплошные дорогие проигрыши), но ещё не «допрос»: 20 диалогов за раз
// игрок не пройдёт, упор на несколько глубоких «почему», а не на количество.
const MAX_CRITICAL_HANDS = 7;

// Базовые ориентиры VPIP/PFR для микролимитного MTT (early-stage solid reg ~19/17-25/23,
// малый разрыв VPIP-PFR = агрессивный, большой = пассивный).
const VPIP_LOOSE_THRESHOLD = 25;
const VPIP_TIGHT_THRESHOLD = 19;
const PFR_GAP_PASSIVE_THRESHOLD = 6;
const POSTFLOP_AF_AGGRESSIVE_THRESHOLD = 3;

const VOLUNTARY_ACTIONS = new Set<TableAction["action"]>(["CALL", "BET", "RAISE", "ALL_IN"]);
const HERO_CONTINUE_ACTIONS = new Set<TableAction["action"]>(["CALL", "RAISE", "ALL_IN"]);

/**
 * Раздача «спорная» — Hero продолжил (колл/рейз/олл-ин) после того как кто-то другой
 * уже добровольно вложил фишки (не считая постов анте/блайндов).
 */
export function isContestedDecision(actions: TableAction[]): boolean {
  let seenVoluntaryOpponent = false;

  for (const action of actions) {
    if (action.actor !== "Hero" && VOLUNTARY_ACTIONS.has(action.action)) {
      seenVoluntaryOpponent = true;
      continue;
    }

    if (action.actor === "Hero" && HERO_CONTINUE_ACTIONS.has(action.action) && seenVoluntaryOpponent) {
      return true;
    }
  }

  return false;
}

/**
 * Критические — спорные раздачи с потерей фишек, отсортированные по размеру потери, до
 * MAX_CRITICAL_HANDS штук (число адаптивное: сколько было дорогих ошибок, столько и берём).
 * Сильные — все спорные раздачи с выигрышем. Остальное — средние.
 */
export function assignImportanceLevels(hands: ParsedHandSnapshot[]): HandImportance[] {
  const contested = hands.map((hand) => isContestedDecision(hand.tableSnapshot.actions));

  const criticalCandidates = hands
    .map((hand, index) => ({ index, hand }))
    .filter(({ index, hand }) => contested[index] && hand.chipResult < 0)
    .sort((a, b) => Math.abs(b.hand.chipResult) - Math.abs(a.hand.chipResult))
    .slice(0, MAX_CRITICAL_HANDS)
    .map(({ index }) => index);

  const criticalSet = new Set(criticalCandidates);

  return hands.map((hand, index) => {
    if (criticalSet.has(index)) return "CRITICAL";
    if (contested[index] && hand.chipResult > 0) return "STRONG";
    return "MEDIUM";
  });
}

/**
 * Постфлоп aggression factor = (беты+рейзы Hero) / (коллы Hero) на FLOP/TURN/RIVER.
 * ALL_IN исключён из обоих счётчиков — тип не различает рейз-олл-ин и колл-олл-ин.
 */
export function computePostflopAggressionFactor(hands: ParsedHandSnapshot[]): number {
  let aggressive = 0;
  let calls = 0;

  for (const hand of hands) {
    for (const action of hand.tableSnapshot.actions) {
      if (action.street === "PREFLOP" || action.actor !== "Hero") continue;
      if (action.action === "BET" || action.action === "RAISE") aggressive++;
      if (action.action === "CALL") calls++;
    }
  }

  return aggressive / Math.max(calls, 0.5);
}

/**
 * Один из 4 стилевых диагнозов — по наибольшему отклонению от базовых ориентиров.
 * При равенстве — порядок LOOSE > TIGHT > PASSIVE > AGGRESSIVE.
 */
export function diagnoseStyle(
  vpipPercent: number,
  pfrPercent: number,
  postflopAggressionFactor: number,
): PlayerStyle {
  const scores: { style: PlayerStyle; score: number }[] = [
    { style: "LOOSE", score: vpipPercent - VPIP_LOOSE_THRESHOLD },
    { style: "TIGHT", score: VPIP_TIGHT_THRESHOLD - vpipPercent },
    { style: "PASSIVE", score: vpipPercent - pfrPercent - PFR_GAP_PASSIVE_THRESHOLD },
    { style: "AGGRESSIVE", score: postflopAggressionFactor - POSTFLOP_AF_AGGRESSIVE_THRESHOLD },
  ];

  return scores.reduce((best, current) => (current.score > best.score ? current : best)).style;
}

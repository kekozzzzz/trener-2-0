import type { HandImportance, ParsedHandSnapshot, PlayerStyle, TableAction } from "../types";
import { detectHeroLuckyWin } from "../lucky-win";
import { detectHeroCooler } from "../cooler";
import { isForcedPreflopAllIn } from "../forced-preflop-allin";
import { topDecisionMark } from "../decision-weight";

// Потолок критических раздач (каждая ведёт сократовский диалог «почему»). Число адаптивное:
// берём все спорные потери, отсортированные по размеру, но не больше потолка. 7 — запас под
// турниры-катастрофы (сплошные дорогие проигрыши), но ещё не «допрос»: 20 диалогов за раз
// игрок не пройдёт, упор на несколько глубоких «почему», а не на количество.
const MAX_CRITICAL_HANDS = 7;

// Квоты внутри потолка (план 2026-07-11-критические-по-решению): потери — до 5 слотов,
// тяжёлые решения (крупный фолд, выигранный блеф, недобор…) — до 2 гарантированных.
// Недобранные слоты свободны для других категорий: потери сверх 5 → решения сверх 2 →
// доезды в остаток. В турнире-катастрофе решения всё равно получают свои 2 слота.
const LOSS_SLOTS = 5;
const DECISION_SLOTS = 2;

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
 * Остаток потолка добирают ДОЕЗДЫ (план 2026-07-04-критические-по-доезду): спорные
 * ВЫИГРАННЫЕ раздачи, где Hero крупно вложился далеко позади вскрытой руки соперника
 * и доехал — «повезло» тоже заслуживает диалога, результат ≠ качество решения.
 * Сильные — остальные спорные раздачи с выигрышем. Остальное — средние.
 */
export function assignImportanceLevels(hands: ParsedHandSnapshot[]): HandImportance[] {
  const contested = hands.map((hand) => isContestedDecision(hand.tableSnapshot.actions));

  // Кулеры — спорные ПОТЕРИ, где Hero в момент крупного вложения был далеко впереди
  // вскрытой руки соперника (тот доехал) и префлоп чистый: разбирать нечего, «сыграл
  // правильно, не повезло». В критические не идут — уходят в тихую стопку без диалога
  // (план 2026-07-05-кулеры-и-перезаходы). Детектор дёшев: сразу null без вскрытия.
  const coolerSet = new Set(
    hands
      .map((hand, index) => ({ index, hand }))
      .filter(({ index, hand }) => contested[index] && hand.chipResult < 0)
      .filter(({ hand }) => detectHeroCooler(hand.tableSnapshot) !== null)
      .map(({ index }) => index),
  );

  // Форсированный префлоп-олл-ин премиум-рукой (Артём 18.07): AK/тузы, всё зашло на префлопе,
  // постфлоп-решений нет — «что бы ни случилось, я выставляюсь». Обсуждать нечего, вердикт
  // выходил пустым. Уходит в ту же тихую стопку кулеров. В отличие от detectHeroCooler НЕ требует
  // фаворитства 67%+ (монетка AK против его диапазона — тоже форс). Постфлоп теми же руками
  // (рейзы на тёрне/ривере, где надо сдаться) детектор сам отсекает — остаётся в разборе.
  for (const [index, hand] of hands.entries()) {
    if (contested[index] && hand.chipResult < 0 && !coolerSet.has(index) && isForcedPreflopAllIn(hand.tableSnapshot))
      coolerSet.add(index);
  }

  // Потери — главный материал, как раньше (топ по размеру), но потолок потерь — 5 слотов:
  // 2 зарезервированы под тяжёлые РЕШЕНИЯ (займут ниже; не наберётся решений — слоты
  // вернутся потерям и доездам).
  const lossCandidates = hands
    .map((hand, index) => ({ index, hand }))
    .filter(({ index, hand }) => contested[index] && hand.chipResult < 0 && !coolerSet.has(index))
    .sort((a, b) => Math.abs(b.hand.chipResult) - Math.abs(a.hand.chipResult));

  const criticalSet = new Set(lossCandidates.slice(0, LOSS_SLOTS).map(({ index }) => index));

  // Тяжёлые решения (план 2026-07-11): крупный фолд после входа, выигранный блеф без
  // вскрытия, пограничный выигранный колл, недобор. Ранжир — вес решения (банк + цена
  // в точке решения), а не итог раздачи. Кулеры и уже взятые потери не дублируем.
  const decisionCandidates = hands
    .map((hand, index) => ({ index, hand, mark: null as ReturnType<typeof topDecisionMark> }))
    .filter(({ index }) => !criticalSet.has(index) && !coolerSet.has(index))
    .map((c) => ({ ...c, mark: topDecisionMark(c.hand.tableSnapshot, c.hand.chipResult) }))
    .filter((c) => c.mark !== null)
    .sort((a, b) => (b.mark?.weightBb ?? 0) - (a.mark?.weightBb ?? 0));

  for (const { index } of decisionCandidates.slice(0, DECISION_SLOTS)) criticalSet.add(index);

  // Свободный остаток потолка: потери сверх 5 → решения сверх 2 → доезды. Детектор
  // доезда дёшев для проигранных и невскрытых раздач (сразу null).
  const fillers: number[] = [
    ...lossCandidates.slice(LOSS_SLOTS).map(({ index }) => index),
    ...decisionCandidates.slice(DECISION_SLOTS).map(({ index }) => index),
    ...hands
      .map((hand, index) => ({ index, hand }))
      .filter(({ index, hand }) => contested[index] && hand.chipResult > 0 && !criticalSet.has(index))
      .filter(({ hand }) => detectHeroLuckyWin(hand.tableSnapshot) !== null)
      .sort((a, b) => b.hand.chipResult - a.hand.chipResult)
      .map(({ index }) => index),
  ];
  for (const index of fillers) {
    if (criticalSet.size >= MAX_CRITICAL_HANDS) break;
    criticalSet.add(index);
  }

  return hands.map((hand, index) => {
    if (coolerSet.has(index)) return "COOLER";
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

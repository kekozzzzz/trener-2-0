import type { ParsedHand } from "@/parser/types";

// Нижняя планка размера карточки: маленький турнир всё равно даёт ~10 раздач (добиваем
// средними для контекста). Потолок: глубокий ран с кучей спорных раздач — не больше 20,
// чтобы не разбавлять внимание и не растягивать ожидание.
const CARD_MIN_TOTAL = 10;
const CARD_MAX_TOTAL = 20;

/**
 * Отбирает раздачи турнира для карточки из полного списка размеченных раздач. Размер не
 * фиксирован — масштабируется от числа спорных раздач (CRITICAL + STRONG) в диапазоне
 * [CARD_MIN_TOTAL, CARD_MAX_TOTAL]:
 *  - спорные раздачи — главный материал, берём ВСЕ (до потолка), сильные не режем;
 *  - средними добиваем только до нижней планки, когда спорных мало.
 * Результат — в хронологическом порядке исходного турнира.
 */
export function selectHandsForCard(hands: ParsedHand[]): ParsedHand[] {
  const indexed = hands.map((hand, index) => ({ hand, index }));

  const critical = indexed.filter(({ hand }) => hand.importanceLevel === "CRITICAL");

  const strongPool = indexed
    .filter(({ hand }) => hand.importanceLevel === "STRONG")
    .sort((a, b) => b.hand.chipResult - a.hand.chipResult);

  const mediumPool = indexed
    .filter(({ hand }) => hand.importanceLevel === "MEDIUM")
    .sort((a, b) => Math.abs(b.hand.chipResult) - Math.abs(a.hand.chipResult));

  // Критические идут первыми, сильные — по размеру выигрыша; вместе это «спорные».
  const contested = [...critical, ...strongPool];
  const contestedTake = contested.slice(0, CARD_MAX_TOTAL);

  // Цель размера тянется за числом спорных, но в коридоре [MIN, MAX]. Средние добирают
  // только нехватку до нижней планки (когда спорных меньше MIN).
  const target = Math.min(Math.max(contested.length, CARD_MIN_TOTAL), CARD_MAX_TOTAL);
  const mediumTake = Math.max(0, target - contestedTake.length);

  const selected = [...contestedTake, ...mediumPool.slice(0, mediumTake)];

  return selected.sort((a, b) => a.index - b.index).map(({ hand }) => hand);
}

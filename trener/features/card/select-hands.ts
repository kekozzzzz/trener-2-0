import type { ParsedHand } from "@/parser/types";

const CARD_TARGET_TOTAL = 10;
const CARD_MAX_STRONG = 5;

/**
 * Отбирает ~10 раздач турнира для карточки из полного списка размеченных раздач.
 * Соотношение CRITICAL/STRONG/MEDIUM не фиксировано — складывается из реальных данных
 * (CRITICAL уже ограничен до 3 в classify.ts, STRONG ограничен здесь до CARD_MAX_STRONG).
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

  const remainingAfterCritical = CARD_TARGET_TOTAL - critical.length;
  const strongTake = Math.min(strongPool.length, CARD_MAX_STRONG, remainingAfterCritical);
  const remainingAfterStrong = remainingAfterCritical - strongTake;
  const mediumTake = Math.min(mediumPool.length, remainingAfterStrong);

  const selected = [...critical, ...strongPool.slice(0, strongTake), ...mediumPool.slice(0, mediumTake)];

  return selected.sort((a, b) => a.index - b.index).map(({ hand }) => hand);
}

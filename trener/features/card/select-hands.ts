import type { ParsedHand, TableAction } from "@/parser/types";

// Потолок карточки: глубокий ран с кучей спорных раздач — не больше 20, чтобы не растягивать
// ожидание и внимание. Нижней планки БОЛЬШЕ НЕТ (правка Артёма 2026-07-14): раньше список
// искусственно добивался до 10 «средними», куда попадали тривиальные сбросы слабой руки на
// префлопе — «мусор». Теперь показываем только раздачи, где реально было над чем думать.
const CARD_MAX_TOTAL = 20;

// Подстраховка от пустой карточки: если спорных раздач нет вовсе, покажем до стольких самых
// весомых раздач, где Hero хотя бы играл руку (добровольно вложился) — чтобы турнир не открывался
// совсем пустым, но и без сброшенного на префлопе мусора.
const CARD_FALLBACK = 3;

const VOLUNTARY_ACTIONS = new Set<TableAction["action"]>(["CALL", "BET", "RAISE", "ALL_IN"]);

// Hero реально играл руку — добровольно вложил фишки (не просто сброс или чек блайнда).
function heroPlayedHand(hand: ParsedHand): boolean {
  return hand.tableSnapshot.actions.some((a) => a.actor === "Hero" && VOLUNTARY_ACTIONS.has(a.action));
}

/**
 * Отбирает раздачи турнира для карточки. Показываем ТОЛЬКО спорные (CRITICAL + STRONG) — это
 * раздачи, где Hero принимал решение против чужих фишек, то есть было над чем думать. Тривиальные
 * раздачи (сброс слабой руки на префлопе, размеченные MEDIUM) к разбору не показываем: лучше
 * одна-две значимые раздачи на маленьком турнире, чем десяток пустышек. Если спорных нет совсем —
 * подстраховка: до CARD_FALLBACK самых весомых сыгранных раздач. Порядок — хронологический.
 */
export function selectHandsForCard(hands: ParsedHand[]): ParsedHand[] {
  const indexed = hands.map((hand, index) => ({ hand, index }));

  const critical = indexed.filter(({ hand }) => hand.importanceLevel === "CRITICAL");
  const strongPool = indexed
    .filter(({ hand }) => hand.importanceLevel === "STRONG")
    .sort((a, b) => b.hand.chipResult - a.hand.chipResult);

  // Критические первыми, сильные — по размеру выигрыша; вместе это «спорные».
  let selected = [...critical, ...strongPool].slice(0, CARD_MAX_TOTAL);

  // Спорных нет — показываем до CARD_FALLBACK самых весомых раздач, где Hero играл руку.
  if (selected.length === 0) {
    selected = indexed
      .filter(({ hand }) => hand.importanceLevel !== "COOLER" && heroPlayedHand(hand))
      .sort((a, b) => Math.abs(b.hand.chipResult) - Math.abs(a.hand.chipResult))
      .slice(0, CARD_FALLBACK);
  }

  return selected.sort((a, b) => a.index - b.index).map(({ hand }) => hand);
}

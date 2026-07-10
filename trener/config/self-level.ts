// «Ориентир» — самооценка игроком своего понимания покера. Мягкий приор для ТОНА и
// ГЛУБИНЫ объяснений тренера на первые турниры, пока нет реальной картины по рукам.
// План: plans/2026-07-10-ориентир-уровень-игрока.md.
//
// Границы (жёсткие):
// - Правило 1: ориентир НЕ влияет на числа, метрики, вердикты — только на тон.
// - Правило 2: «Глубоко в теории» не отменяет сократовский вопрос «почему».
// - Данные с рук > самооменка: внутри окна руки перебивают ориентир, а после окна
//   он вообще не идёт в промпт и пропадает из интерфейса (см. isSelfLevelActive).
// Правило 3: пороги и подписи — здесь (конфиг), не в бизнес-логике и не в вёрстке.

export const SELF_LEVELS = ["NEW", "BASICS", "CONFIDENT", "DEEP"] as const;
export type SelfLevel = (typeof SELF_LEVELS)[number];

export function isValidSelfLevel(value: unknown): value is SelfLevel {
  return typeof value === "string" && (SELF_LEVELS as readonly string[]).includes(value);
}

// Русские подписи для ПРОМПТА тренера (покерная проза промптов — русская, как и в
// config/prompts/player-card.ts; язык ответа тренеру задаёт отдельная директива locale).
export const SELF_LEVEL_PROMPT_LABEL: Record<SelfLevel, string> = {
  NEW: "только начинаю — ещё осваиваю правила и базовые понятия",
  BASICS: "знаю основы — понимаю позиции и банк-оддсы, но неглубоко",
  CONFIDENT: "уверенно разбираюсь — думаю диапазонами, читаю розыгрыш по улицам",
  DEEP: "глубоко в теории — сильная база, азы не нужны",
};

// Окно, пока ориентир ещё помогает: что раньше — N турниров ИЛИ M рук. Руки —
// более честная мера «сколько тренер успел увидеть» (кто-то вылетает рано и даёт
// мало рук за много турниров, кто-то доходит глубоко). Пересечение любого порога
// = крючок отработал, дальше опираемся на «карточку ученика».
export const SELF_LEVEL_MAX_TOURNAMENTS = 10;
export const SELF_LEVEL_MAX_HANDS = 1500;

// Ориентир ещё активен (идёт в промпт, строчка видна), пока НЕ пересечён ни один
// порог. handsCounted — суммарно учтённых рук игрока (tournamentsCounted × avgHandsCount).
export function isSelfLevelActive(input: { tournamentsCounted: number; handsCounted: number }): boolean {
  return input.tournamentsCounted < SELF_LEVEL_MAX_TOURNAMENTS && input.handsCounted < SELF_LEVEL_MAX_HANDS;
}

// Глубина сократовского диалога — бизнес-число, живёт только в конфиге/.env
// (правило проекта №3). Одинакова для всех тарифов подписки
// (architecture/02-сущности.md, решение 2026-06-11).

const DEFAULT_ROUNDS_PER_HAND = 5;

export function getDialogueRoundsPerHand(): number {
  const raw = process.env.DIALOGUE_ROUNDS_PER_HAND;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ROUNDS_PER_HAND;
}

import type { DialogueState } from "@prisma/client";

// Единый гейт доступности чата по раздаче (plans/2026-06-17-чат-на-простых-раздачах.md,
// раздел 0). Один источник правды для трёх мест: getChat, sendChatMessage,
// generate-chat-reply.
//
// Правило №2 (architecture/00-правила-проекта.md): по КРИТИЧЕСКОЙ ошибке нельзя
// спросить «как надо было» в обход сократовского вопроса «почему», поэтому для
// раздач с диалогом чат открыт только после VERDICT_SHOWN. У простых раздач
// (STRONG/MEDIUM) диалога нет — критической ошибки тоже нет, прямой вопрос
// правило №2 не обходит, чат доступен сразу после готового разбора.
//
// analysis != null уже означает, что раздача попала в карточку (только для
// selected_for_card раздач генерируется GENERATE_HAND_ANALYSIS), поэтому
// отдельной проверки selected_for_card не нужно.
type ChatGateHand = {
  analysis: unknown | null;
  dialogue: { state: DialogueState } | null;
};

export function isChatAvailable(hand: ChatGateHand): boolean {
  if (hand.analysis == null) return false; // разбор ещё не готов
  if (hand.dialogue == null) return true; // STRONG/MEDIUM — прямой чат
  return hand.dialogue.state === "VERDICT_SHOWN"; // CRITICAL — только после диалога
}

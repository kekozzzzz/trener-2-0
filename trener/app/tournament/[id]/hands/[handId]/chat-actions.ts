"use server";

import { revalidatePath } from "next/cache";
import { sendChatMessage } from "@/features/chat/actions";
import { authorizeHand } from "@/features/auth/ownership";

export type ChatFormState = {
  error?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  HAND_NOT_FOUND: "Раздача не найдена.",
  CHAT_NOT_AVAILABLE: "Чат пока недоступен.",
  EMPTY_MESSAGE: "Сообщение не может быть пустым.",
  MESSAGE_TOO_LONG: "Сообщение слишком длинное.",
  AWAITING_REPLY: "Подожди ответа на предыдущее сообщение.",
};

export async function sendChatMessageAction(
  tournamentId: string,
  handId: string,
  _prevState: ChatFormState,
  formData: FormData,
): Promise<ChatFormState> {
  // Server action — самостоятельная точка входа, доступна и в обход формы:
  // проверяем права на раздачу до любой записи (architecture/07-безопасность.md,
  // раздел 2). Чужая/несуществующая раздача — один и тот же ответ, без утечки.
  if (!(await authorizeHand(handId))) {
    return { error: ERROR_MESSAGES.HAND_NOT_FOUND };
  }

  const text = String(formData.get("message") ?? "");
  const result = await sendChatMessage({ handId, text });

  if (!result.ok) {
    return { error: ERROR_MESSAGES[result.error] };
  }

  revalidatePath(`/tournament/${tournamentId}/hands/${handId}`);
  return {};
}

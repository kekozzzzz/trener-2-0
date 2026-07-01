"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { sendChatMessage } from "@/features/chat/actions";
import { authorizeHand } from "@/features/auth/ownership";
import { checkLlmMessageQuota } from "@/features/usage/limit";

export type ChatFormState = {
  error?: string;
};

export async function sendChatMessageAction(
  tournamentId: string,
  handId: string,
  _prevState: ChatFormState,
  formData: FormData,
): Promise<ChatFormState> {
  const t = await getTranslations("Errors");
  // Мапа код→текст: только те коды, что были в ERROR_MESSAGES. Для остальных
  // кодов (PAYWALL/LIMIT_REACHED) обращение даёт undefined — как и прежде.
  const errorMessages: Record<string, string> = {
    HAND_NOT_FOUND: t("HAND_NOT_FOUND"),
    CHAT_NOT_AVAILABLE: t("CHAT_NOT_AVAILABLE"),
    EMPTY_MESSAGE: t("EMPTY_MESSAGE"),
    MESSAGE_TOO_LONG: t("MESSAGE_TOO_LONG"),
    AWAITING_REPLY: t("AWAITING_REPLY"),
    TOO_MANY_MESSAGES: t("TOO_MANY_MESSAGES"),
  };

  // Server action — самостоятельная точка входа, доступна и в обход формы:
  // проверяем права на раздачу до любой записи (architecture/07-безопасность.md,
  // раздел 2). Чужая/несуществующая раздача — один и тот же ответ, без утечки.
  const auth = await authorizeHand(handId);
  if (!auth) {
    return { error: errorMessages.HAND_NOT_FOUND };
  }

  // Лимит платных сообщений в час на игрока — после проверки прав, до вызова Claude.
  if (!checkLlmMessageQuota(auth.playerId).ok) {
    return { error: errorMessages.TOO_MANY_MESSAGES };
  }

  const text = String(formData.get("message") ?? "");
  const result = await sendChatMessage({ handId, text });

  if (!result.ok) {
    return { error: errorMessages[result.error] };
  }

  revalidatePath(`/tournament/${tournamentId}/hands/${handId}`);
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { sendChatMessage } from "@/features/chat/actions";

export type ChatFormState = {
  error?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  HAND_NOT_FOUND: "Раздача не найдена.",
  CHAT_NOT_AVAILABLE: "Чат пока недоступен.",
  EMPTY_MESSAGE: "Сообщение не может быть пустым.",
  AWAITING_REPLY: "Подожди ответа на предыдущее сообщение.",
};

export async function sendChatMessageAction(
  tournamentId: string,
  handId: string,
  _prevState: ChatFormState,
  formData: FormData,
): Promise<ChatFormState> {
  const text = String(formData.get("message") ?? "");
  const result = await sendChatMessage({ handId, text });

  if (!result.ok) {
    return { error: ERROR_MESSAGES[result.error] };
  }

  revalidatePath(`/tournament/${tournamentId}/hands/${handId}`);
  return {};
}

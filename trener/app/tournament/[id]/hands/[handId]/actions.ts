"use server";

import { revalidatePath } from "next/cache";
import { submitAnswer } from "@/features/dialogue/actions";
import { authorizeHand } from "@/features/auth/ownership";
import { checkLlmMessageQuota } from "@/features/usage/limit";

export type AnswerFormState = {
  error?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  DIALOGUE_NOT_FOUND: "Диалог не найден.",
  EMPTY_ANSWER: "Ответ не может быть пустым.",
  ANSWER_TOO_LONG: "Ответ слишком длинный.",
  TOO_MANY_MESSAGES: "Слишком много сообщений за час. Подожди немного и продолжи.",
};

export async function submitAnswerAction(
  tournamentId: string,
  handId: string,
  _prevState: AnswerFormState,
  formData: FormData,
): Promise<AnswerFormState> {
  // Server action — самостоятельная точка входа, доступна и в обход формы:
  // проверяем права на раздачу до записи ответа (architecture/07-безопасность.md,
  // раздел 2). Чужая/несуществующая раздача — один и тот же ответ, без утечки.
  const auth = await authorizeHand(handId);
  if (!auth) {
    return { error: ERROR_MESSAGES.DIALOGUE_NOT_FOUND };
  }

  // Лимит платных сообщений в час на игрока — после проверки прав (чтобы не
  // выдать факт существования чужой раздачи), но до вызова Claude за вердиктом.
  if (!checkLlmMessageQuota(auth.playerId).ok) {
    return { error: ERROR_MESSAGES.TOO_MANY_MESSAGES };
  }

  const answer = String(formData.get("answer") ?? "");
  const result = await submitAnswer({ handId, answer });

  if (!result.ok) {
    return { error: ERROR_MESSAGES[result.error] };
  }

  revalidatePath(`/tournament/${tournamentId}/hands/${handId}`);
  return {};
}

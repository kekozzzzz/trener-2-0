"use server";

import { revalidatePath } from "next/cache";
import { submitAnswer } from "@/features/dialogue/actions";
import { authorizeHand } from "@/features/auth/ownership";

export type AnswerFormState = {
  error?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  DIALOGUE_NOT_FOUND: "Диалог не найден.",
  EMPTY_ANSWER: "Ответ не может быть пустым.",
  ANSWER_TOO_LONG: "Ответ слишком длинный.",
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
  if (!(await authorizeHand(handId))) {
    return { error: ERROR_MESSAGES.DIALOGUE_NOT_FOUND };
  }

  const answer = String(formData.get("answer") ?? "");
  const result = await submitAnswer({ handId, answer });

  if (!result.ok) {
    return { error: ERROR_MESSAGES[result.error] };
  }

  revalidatePath(`/tournament/${tournamentId}/hands/${handId}`);
  return {};
}

"use server";

import { revalidatePath } from "next/cache";
import { submitAnswer } from "@/features/dialogue/actions";

export type AnswerFormState = {
  error?: string;
};

export async function submitAnswerAction(
  tournamentId: string,
  handId: string,
  _prevState: AnswerFormState,
  formData: FormData,
): Promise<AnswerFormState> {
  const answer = String(formData.get("answer") ?? "");
  const result = await submitAnswer({ handId, answer });

  if (!result.ok) {
    return { error: result.error === "EMPTY_ANSWER" ? "Ответ не может быть пустым." : "Диалог не найден." };
  }

  revalidatePath(`/tournament/${tournamentId}/hands/${handId}`);
  return {};
}

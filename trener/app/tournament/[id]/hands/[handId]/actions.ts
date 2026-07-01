"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { submitAnswer } from "@/features/dialogue/actions";
import { authorizeHand } from "@/features/auth/ownership";
import { checkLlmMessageQuota } from "@/features/usage/limit";
import { prisma } from "@/infrastructure/db/client";

export type AnswerFormState = {
  error?: string;
};

export async function submitAnswerAction(
  tournamentId: string,
  handId: string,
  _prevState: AnswerFormState,
  formData: FormData,
): Promise<AnswerFormState> {
  const t = await getTranslations("Errors");
  // Мапа код→текст: только те коды, что были в ERROR_MESSAGES. Для остальных
  // кодов (PAYWALL/LIMIT_REACHED) обращение даёт undefined — как и прежде.
  const errorMessages: Record<string, string> = {
    DIALOGUE_NOT_FOUND: t("DIALOGUE_NOT_FOUND"),
    EMPTY_ANSWER: t("EMPTY_ANSWER"),
    ANSWER_TOO_LONG: t("ANSWER_TOO_LONG"),
    TOO_MANY_MESSAGES: t("TOO_MANY_MESSAGES"),
  };

  // Server action — самостоятельная точка входа, доступна и в обход формы:
  // проверяем права на раздачу до записи ответа (architecture/07-безопасность.md,
  // раздел 2). Чужая/несуществующая раздача — один и тот же ответ, без утечки.
  const auth = await authorizeHand(handId);
  if (!auth) {
    return { error: errorMessages.DIALOGUE_NOT_FOUND };
  }

  // Лимит платных сообщений в час на игрока — после проверки прав (чтобы не
  // выдать факт существования чужой раздачи), но до вызова Claude за вердиктом.
  if (!checkLlmMessageQuota(auth.playerId).ok) {
    return { error: errorMessages.TOO_MANY_MESSAGES };
  }

  const answer = String(formData.get("answer") ?? "");
  const result = await submitAnswer({ handId, answer });

  if (!result.ok) {
    return { error: errorMessages[result.error] };
  }

  revalidatePath(`/tournament/${tournamentId}/hands/${handId}`);
  return {};
}

// Отметить раздачу просмотренной: фиксируем момент первого открытия страницы разбора.
// Используется для пометки «Просмотрено» на простых раздачах и подсветки турниров,
// пройденных целиком. Идемпотентно — пишем только если viewedAt ещё пуст (updateMany
// с фильтром, чтобы не перетирать первую дату и не плодить лишние записи в журнал).
// Права проверяем через authorizeHand (защита от IDOR), на отказ молча выходим —
// это фоновый сигнал прогресса, не показывает игроку ошибок.
export async function markHandViewedAction(handId: string): Promise<void> {
  const auth = await authorizeHand(handId);
  if (!auth) return;

  await prisma.hand.updateMany({
    where: { id: handId, viewedAt: null },
    data: { viewedAt: new Date() },
  });
}

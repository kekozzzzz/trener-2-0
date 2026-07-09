"use server";

import { prisma } from "@/infrastructure/db/client";
import { kickWorker } from "@/infrastructure/queue";
import { authorizeHand } from "@/features/auth/ownership";
import { requireSession } from "@/features/auth/session";
import {
  requeuePoisonedTasks,
  DIALOGUE_STEPS,
  CHAT_STEPS,
  PARSE_STEPS,
} from "./queries";

// Действия «повторить» для застрявших шагов, которых ждёт игрок. Сбрасываем POISONED-задачу
// в PENDING и будим воркер. Если сбрасывать нечего (нет прав или нет карантинной задачи),
// возвращаем ok=false — клиент просто продолжит ждать, ничего не ломая. Права проверяем
// ОБЯЗАТЕЛЬНО: чужую задачу игрок перезапустить не может (architecture/07-безопасность.md).

async function requeueAndKick(
  types: string[],
  key: "handId" | "tournamentId",
  value: string,
): Promise<boolean> {
  const count = await requeuePoisonedTasks(prisma, types, key, value);
  if (count > 0) void kickWorker(prisma);
  return count > 0;
}

// Повторить застрявший шаг диалога (следующий вопрос или вердикт).
export async function retryDialogueStep(handId: string): Promise<{ ok: boolean }> {
  if (!(await authorizeHand(handId))) return { ok: false };
  return { ok: await requeueAndKick(DIALOGUE_STEPS, "handId", handId) };
}

// Повторить застрявший ответ в чате.
export async function retryChatReply(handId: string): Promise<{ ok: boolean }> {
  if (!(await authorizeHand(handId))) return { ok: false };
  return { ok: await requeueAndKick(CHAT_STEPS, "handId", handId) };
}

// Повторить застрявший парсинг турнира. Прав на раздачу тут нет — проверяем владельца
// турнира напрямую по сессии (тот же приём, что в /api/tournament/[id]/status).
export async function retryTournamentParse(tournamentId: string): Promise<{ ok: boolean }> {
  const { playerId } = await requireSession();
  const owned = await prisma.tournament.findFirst({
    where: { id: tournamentId, playerId, deletedAt: null },
    select: { id: true },
  });
  if (!owned) return { ok: false };
  return { ok: await requeueAndKick(PARSE_STEPS, "tournamentId", tournamentId) };
}

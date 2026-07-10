"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";
import { enqueue, CRITICAL_ANALYSIS_PRIORITY } from "@/infrastructure/queue";
import { requireSession } from "@/features/auth/session";
import { assessAiAccess } from "@/features/usage/budget";
import { checkUploadQuota } from "@/features/usage/limit";
import { isValidSelfLevel } from "@/config/self-level";

// «Ориентир»: игрок сам отметил уровень понимания покера (мягкий приор для тона
// тренера, план 2026-07-10-ориентир-уровень-игрока). Аккаунт-уровень (Player), хотя
// строчка живёт на странице турнира. Пустое/невалидное значение = сброс (NULL).
// Правило 1/2 соблюдаются в промпте, не здесь: это поле влияет только на тон.
export async function setSelfLevelAction(level: string, tournamentId: string): Promise<void> {
  const { playerId } = await requireSession();
  const value = isValidSelfLevel(level) ? level : null;
  await prisma.player.update({ where: { id: playerId }, data: { selfLevel: value } });
  revalidatePath(`/tournament/${tournamentId}`);
}

// Открыть разбор у запертого турнира (модель «грузи сколько угодно, разбор — у
// одного бесплатного, остальные под замком»). Платный гейт сохраняется: открываем
// только если разрешено бюджетом (правило №1 — не уходить в минус по ИИ). НЕ массовая
// разблокировка: игрок открывает турниры по одному, каждый проходит проверку бюджета.
export async function unlockTournamentAnalysisAction(formData: FormData): Promise<void> {
  const tournamentId = String(formData.get("tournamentId") ?? "");
  const { playerId } = await requireSession();

  // Права: чужой/несуществующий турнир — молча уводим, без утечки факта.
  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, playerId: true, deletedAt: true, analysisUnlocked: true },
  });
  if (!tournament || tournament.deletedAt || tournament.playerId !== playerId) {
    redirect("/tournaments");
  }
  if (tournament.analysisUnlocked) {
    redirect(`/tournament/${tournamentId}`); // уже открыт
  }

  // Часовой лимит платных запусков (как у загрузки) — один разбор = десятки вызовов.
  if (!checkUploadQuota(playerId).ok) {
    redirect(`/tournament/${tournamentId}?error=RATE_LIMITED`);
  }

  // Бюджетный гейт: открываем разбор только если доступ разрешён. При отказе
  // ОСТАЁМСЯ на странице турнира (метрики парсера видны всегда — обещание продукта);
  // раньше PAYWALL молча уносил в /pricing, и игрок не видел свой турнир (QA 2026-07-05).
  const access = await assessAiAccess(prisma, playerId, { tournamentId });
  if (!access.allowed) {
    redirect(`/tournament/${tournamentId}?error=${access.reason === "PAYWALL" ? "PAYWALL" : "LIMIT_REACHED"}`);
  }

  // Идемпотентно: флаг переводим в true только из false; кто перевёл (count>0), тот
  // и ставит задачи — конкурентные клики получат count 0 и не задвоят разбор.
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.tournament.updateMany({
      where: { id: tournamentId, analysisUnlocked: false, deletedAt: null },
      data: { analysisUnlocked: true },
    });
    if (count === 0) return;

    const hands = await tx.hand.findMany({
      where: { tournamentId, selectedForCard: true, analysis: { equals: Prisma.DbNull } },
      select: { id: true, importanceLevel: true },
    });
    for (const h of hands) {
      // Критические раздачи — вперёд рядового разбора, чтобы всплывали первыми.
      await enqueue(tx, {
        type: "GENERATE_HAND_ANALYSIS",
        payload: { handId: h.id },
        priority: h.importanceLevel === "CRITICAL" ? CRITICAL_ANALYSIS_PRIORITY : 0,
      });
    }
  });

  redirect(`/tournament/${tournamentId}`);
}

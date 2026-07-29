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
import { safeNotifyAdmin } from "@/infrastructure/adapters/notify";
import { getTranslations } from "next-intl/server";

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

// ─────────────────── Опрос «мы только в начале пути» после первого турнира ────
// Показывается один раз (флаг Player.introSurveyShownAt), план 2026-07-29. 4 оценки
// обязательны, 6 текстовых полей — по желанию. Ничего не считает и не советует —
// чистый сбор мнения, правила 1/2 не затронуты.

export type IntroSurveyState = { error?: string; success?: boolean };

const MAX_SURVEY_TEXT_LENGTH = 2000;

function surveyRatingOf(formData: FormData, name: string): number | null {
  const n = Number(formData.get(name));
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

function surveyTextOf(formData: FormData, name: string): string | null {
  const raw = String(formData.get(name) ?? "").trim();
  return raw ? raw.slice(0, MAX_SURVEY_TEXT_LENGTH) : null;
}

export async function submitIntroSurveyAction(
  _prev: IntroSurveyState,
  formData: FormData,
): Promise<IntroSurveyState> {
  const t = await getTranslations("Errors");
  const { playerId } = await requireSession();
  const tournamentId = String(formData.get("tournamentId") ?? "");

  const tournament = await prisma.tournament.findUnique({
    where: { id: tournamentId },
    select: { id: true, playerId: true, deletedAt: true },
  });
  if (!tournament || tournament.deletedAt || tournament.playerId !== playerId) {
    return { error: t("introSurveyNotFound") };
  }

  const usefulnessRating = surveyRatingOf(formData, "usefulnessRating");
  const toneRating = surveyRatingOf(formData, "toneRating");
  const questionsRating = surveyRatingOf(formData, "questionsRating");
  const recommendRating = surveyRatingOf(formData, "recommendRating");
  if (!usefulnessRating || !toneRating || !questionsRating || !recommendRating) {
    return { error: t("introSurveyMissingRatings") };
  }

  const unclearText = surveyTextOf(formData, "unclearText");
  const styleChangeText = surveyTextOf(formData, "styleChangeText");
  const moreDetailText = surveyTextOf(formData, "moreDetailText");
  const likedText = surveyTextOf(formData, "likedText");
  const missingText = surveyTextOf(formData, "missingText");
  const freeformText = surveyTextOf(formData, "freeformText");

  await prisma.$transaction([
    prisma.introSurveyResponse.create({
      data: {
        playerId,
        tournamentId,
        usefulnessRating,
        unclearText,
        toneRating,
        styleChangeText,
        questionsRating,
        moreDetailText,
        likedText,
        missingText,
        recommendRating,
        freeformText,
      },
    }),
    prisma.player.update({ where: { id: playerId }, data: { introSurveyShownAt: new Date() } }),
  ]);

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { email: true, nickname: true },
  });
  const who = player?.nickname ?? player?.email ?? playerId;
  const lines = [
    "📝 Опрос после первого турнира",
    `Игрок: ${who}`,
    `Полезность разбора: ${usefulnessRating}/5`,
    `Тон тренера: ${toneRating}/5`,
    `Вопросы тренера: ${questionsRating}/5`,
    `Посоветует другу: ${recommendRating}/5`,
  ];
  if (unclearText) lines.push("", "Что было непонятно/пропущено:", unclearText);
  if (styleChangeText) lines.push("", "Что изменить в подаче:", styleChangeText);
  if (moreDetailText) lines.push("", "Больше/меньше деталей:", moreDetailText);
  if (likedText) lines.push("", "Что зацепило больше всего:", likedText);
  if (missingText) lines.push("", "Чего не хватило:", missingText);
  if (freeformText) lines.push("", "Свободный комментарий:", freeformText);
  await safeNotifyAdmin(lines.join("\n"));

  return { success: true };
}

// Закрытие опроса без ответа — тоже засчитывается как «показали», второй раз не навязываемся.
export async function dismissIntroSurveyAction(): Promise<void> {
  const { playerId } = await requireSession();
  await prisma.player.update({ where: { id: playerId }, data: { introSurveyShownAt: new Date() } });
}

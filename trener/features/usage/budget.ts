// Гейт платных ИИ-действий по подписке/бюджету (кредитная система,
// plans/2026-06-21-кредитная-система.md). Не "use server": обычные функции,
// вызываются server-action точками входа (загрузка турнира, ответ в диалоге, чат)
// ДО постановки платной задачи. На клиент не попадают.

import type { PrismaClient } from "@prisma/client";
import { getPlanBudgetUsd } from "@/config/plans";
import { isAdminEmail } from "@/config/admin";

export type AiAccess =
  | { allowed: true }
  // Нет активной подписки и бесплатный доступ (первый турнир) исчерпан → витрина подписки.
  | { allowed: false; reason: "PAYWALL" }
  // Подписка есть, но месячный бюджет себестоимости исчерпан → стена со сроком обновления.
  | { allowed: false; reason: "LIMIT_REACHED"; resetsAt: Date | null };

// Сколько игрок «наел» себестоимости ($) с начала периода — сумма LlmUsage.costUsd.
export async function spentThisPeriodUsd(
  db: PrismaClient,
  playerId: string,
  since: Date,
): Promise<number> {
  const agg = await db.llmUsage.aggregate({
    where: { playerId, createdAt: { gte: since } },
    _sum: { costUsd: true },
  });
  return agg._sum.costUsd ? Number(agg._sum.costUsd) : 0;
}

// Решение о доступе к одному платному ИИ-действию.
// opts.tournamentId — если действие привязано к конкретному турниру (диалог/чат);
// для загрузки НОВОГО турнира не передаётся.
export async function assessAiAccess(
  db: PrismaClient,
  playerId: string,
  opts?: { tournamentId?: string },
): Promise<AiAccess> {
  const player = await db.player.findUnique({
    where: { id: playerId },
    select: { email: true, subscription: true },
  });
  if (!player) return { allowed: false, reason: "PAYWALL" };

  // Владелец (оператор) — без лимита (project_owner_comp_access).
  if (isAdminEmail(player.email)) return { allowed: true };

  const sub = player.subscription;
  const active = sub != null && sub.status === "ACTIVE" && sub.deletedAt === null;

  if (active && sub) {
    const budget = getPlanBudgetUsd(sub.planCode);
    // Неизвестный план в подписке — не блокируем (защитно: лучше пропустить, чем
    // ошибочно закрыть оплаченный доступ; критическая поломка №1 — потерять подписку).
    if (budget == null) return { allowed: true };
    const spent = await spentThisPeriodUsd(db, playerId, sub.currentPeriodStart);
    if (spent >= budget) {
      return { allowed: false, reason: "LIMIT_REACHED", resetsAt: sub.nextPaymentAt ?? null };
    }
    return { allowed: true };
  }

  // Без активной подписки — бесплатно только ПЕРВЫЙ турнир игрока (с диалогом).
  const firstTournament = await db.tournament.findFirst({
    where: { playerId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  // Загрузка нового турнира: свободно, только если турниров ещё нет (это и будет первый).
  if (!opts?.tournamentId) {
    return firstTournament ? { allowed: false, reason: "PAYWALL" } : { allowed: true };
  }

  // Диалог/чат: свободно, только если действие на первом (бесплатном) турнире.
  if (firstTournament && firstTournament.id === opts.tournamentId) return { allowed: true };
  return { allowed: false, reason: "PAYWALL" };
}

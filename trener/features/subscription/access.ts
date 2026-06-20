// Доступ по подписке: есть ли у игрока оплаченный доступ и сколько турниров
// осталось в текущем периоде по его тарифу. Чистые запросы к БД — без побочных
// эффектов; вызывается из гейта загрузки (Фаза 3) и из личного кабинета.
//
// Числа лимитов и длительность периода — из config/pricing (правило 3), здесь
// только логика «активна ли подписка прямо сейчас».

import { prisma } from "@/infrastructure/db/client";
import { getPlan, getFreeTournamentLimit, getSubscriptionPeriodDays } from "@/config/pricing";
import type { Subscription } from "@prisma/client";

export type SubscriptionState = {
  subscription: Subscription | null;
  hasAccess: boolean; // оплаченный период ещё не истёк
  planCode: string | null;
};

// Доступ есть, пока подписка не EXPIRED и оплаченный период не закончился
// (nextPaymentAt в будущем). CANCELED тоже даёт доступ до конца оплаченного периода
// — отмена выключает автопродление, но не отбирает уже оплаченное.
export async function getSubscriptionState(playerId: string): Promise<SubscriptionState> {
  const subscription = await prisma.subscription.findFirst({
    where: { playerId, deletedAt: null },
  });

  if (!subscription) return { subscription: null, hasAccess: false, planCode: null };

  const now = new Date();
  const periodValid = subscription.nextPaymentAt
    ? subscription.nextPaymentAt > now
    : subscription.status === "ACTIVE";
  const hasAccess = subscription.status !== "EXPIRED" && periodValid;

  return { subscription, hasAccess, planCode: subscription.planCode };
}

export async function hasActiveAccess(playerId: string): Promise<boolean> {
  return (await getSubscriptionState(playerId)).hasAccess;
}

// Сколько турниров игрок может ещё загрузить. Без активной подписки действует
// бесплатный лимит (первый турнир бесплатно). С подпиской — лимит тарифа за
// текущий оплаченный период. Возвращает остаток (>= 0).
export async function getRemainingTournaments(playerId: string): Promise<number> {
  const state = await getSubscriptionState(playerId);

  let limit: number;
  let periodStart: Date;

  if (state.hasAccess && state.subscription) {
    const plan = state.planCode ? getPlan(state.planCode) : undefined;
    limit = plan?.monthlyTournamentLimit ?? 0;
    periodStart = state.subscription.currentPeriodStart;
  } else {
    // Бесплатный режим: лимит за всё время (первый турнир бесплатно).
    limit = getFreeTournamentLimit();
    periodStart = new Date(0);
  }

  const used = await prisma.tournament.count({
    where: { playerId, deletedAt: null, createdAt: { gte: periodStart } },
  });

  return Math.max(0, limit - used);
}

// Конец текущего оплаченного периода — для показа в личном кабинете.
export function periodEnd(subscription: Subscription): Date {
  if (subscription.nextPaymentAt) return subscription.nextPaymentAt;
  const days = getSubscriptionPeriodDays();
  return new Date(subscription.currentPeriodStart.getTime() + days * 24 * 60 * 60 * 1000);
}

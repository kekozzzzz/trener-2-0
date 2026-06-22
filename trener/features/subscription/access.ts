// Статус подписки игрока: активна ли прямо сейчас, какой тариф, когда обновляется.
// Чистые запросы к БД без побочных эффектов — для личного кабинета и страницы цен.
//
// ВАЖНО: гейт ПОТРЕБЛЕНИЯ (можно ли выполнить платное ИИ-действие) живёт в
// features/usage/budget.ts (кредитная модель — бюджет себестоимости, не число
// турниров). Здесь — только «есть ли оплаченный доступ и до какой даты». Старый гейт
// по числу турниров (getRemainingTournaments/monthlyTournamentLimit) удалён вместе с
// config/pricing — заменён бюджетным (plans/2026-06-21-кредитная-система.md).

import { prisma } from "@/infrastructure/db/client";
import { getSubscriptionPeriodDays } from "@/config/plans";
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

// Конец текущего оплаченного периода — для показа в личном кабинете.
export function periodEnd(subscription: Subscription): Date {
  if (subscription.nextPaymentAt) return subscription.nextPaymentAt;
  const days = getSubscriptionPeriodDays();
  return new Date(subscription.currentPeriodStart.getTime() + days * 24 * 60 * 60 * 1000);
}

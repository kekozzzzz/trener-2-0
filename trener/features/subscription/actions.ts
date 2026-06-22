"use server";

// Серверные экшены подписки. Точка входа из UI (страница тарифов / личный кабинет).
// Само создание платежа делегируется порту платежей (правило 4) — здесь только
// авторизация, выбор тарифа из конфига и сборка параметров.

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import { getPlan, getCurrency, getSubscriptionPeriodDays } from "@/config/plans";
import { getAppBaseUrl } from "@/config/app";
import { getPaymentsAdapter } from "@/infrastructure/adapters/payments";
import { prisma } from "@/infrastructure/db/client";
import { getSubscriptionState } from "@/features/subscription/access";
import { proratedUpgradeKopecks } from "@/features/subscription/proration";

export type StartCheckoutResult =
  | { ok: true; confirmationUrl: string }
  | { ok: false; error: "UNKNOWN_PLAN" | "PROVIDER_ERROR" };

// Создать первый платёж подписки по выбранному тарифу и вернуть ссылку на оплату.
// savePaymentMethod: true — карта сохраняется для автопродления (рекуррент).
export async function startCheckout(planCode: string): Promise<StartCheckoutResult> {
  const { playerId } = await requireSession();

  const plan = getPlan(planCode);
  if (!plan) return { ok: false, error: "UNKNOWN_PLAN" };

  // Свой ключ идемпотентности на каждую попытку оплаты — ЮKassa не создаст второй
  // платёж, если этот же запрос повторится (сетевой ретрай).
  const idempotenceKey = randomUUID();

  try {
    const checkout = await getPaymentsAdapter().createCheckout({
      idempotenceKey,
      money: { amountKopecks: plan.amountKopecks, currency: getCurrency() },
      description: `Подписка «${plan.title}» — whygrid`,
      returnUrl: `${getAppBaseUrl()}/account`,
      savePaymentMethod: true,
      metadata: { playerId, planCode: plan.code },
    });
    return { ok: true, confirmationUrl: checkout.confirmationUrl };
  } catch (e) {
    console.error("startCheckout: ошибка создания платежа", e);
    return { ok: false, error: "PROVIDER_ERROR" };
  }
}

export type SwitchPlanResult =
  | { ok: true; confirmationUrl: string }
  // Даунгрейд (более дешёвый тариф) запланирован: вступит в силу со следующего периода
  // при автопродлении (scheduledPlanCode). Деньги сейчас не списываем.
  | { ok: true; scheduled: true }
  | {
      ok: false;
      error: "UNKNOWN_PLAN" | "SAME_PLAN" | "NO_SUBSCRIPTION" | "PROVIDER_ERROR";
    };

// Сменить тариф активной подписке. Апгрейд (дороже) — сразу, в день перехода: новый
// период стартует сегодня, а неиспользованная часть оплаты текущего тарифа идёт в
// зачёт цены нового (списываем только разницу). Даунгрейд — со следующего периода.
// Сброс периода и смену плана делает applySucceededPayment по metadata.intent="switch".
export async function switchPlan(newPlanCode: string): Promise<SwitchPlanResult> {
  const { playerId } = await requireSession();

  const newPlan = getPlan(newPlanCode);
  if (!newPlan) return { ok: false, error: "UNKNOWN_PLAN" };

  const state = await getSubscriptionState(playerId);
  if (!state.hasAccess || !state.subscription) return { ok: false, error: "NO_SUBSCRIPTION" };

  const currentPlan = getPlan(state.planCode);
  // Текущий план неизвестен в конфиге — нечем посчитать зачёт; пусть оформляет заново.
  if (!currentPlan) return { ok: false, error: "NO_SUBSCRIPTION" };
  if (currentPlan.code === newPlan.code) return { ok: false, error: "SAME_PLAN" };

  // Дешевле — это даунгрейд: запоминаем как запланированный тариф, применит автопродление
  // в начале следующего периода (текущий оплаченный период остаётся на старом тарифе).
  if (newPlan.amountKopecks < currentPlan.amountKopecks) {
    await prisma.subscription.updateMany({
      where: { playerId, deletedAt: null },
      data: { scheduledPlanCode: newPlan.code },
    });
    revalidatePath("/account");
    return { ok: true, scheduled: true };
  }

  const now = new Date();
  const nextPaymentAt = state.subscription.nextPaymentAt ?? now;
  const chargeKopecks = proratedUpgradeKopecks(
    currentPlan.amountKopecks,
    newPlan.amountKopecks,
    nextPaymentAt,
    now,
    getSubscriptionPeriodDays(),
  );

  const idempotenceKey = randomUUID();
  try {
    const checkout = await getPaymentsAdapter().createCheckout({
      idempotenceKey,
      money: { amountKopecks: chargeKopecks, currency: getCurrency() },
      description: `Переход на тариф «${newPlan.title}» — whygrid`,
      returnUrl: `${getAppBaseUrl()}/account`,
      savePaymentMethod: true,
      metadata: { playerId, planCode: newPlan.code, intent: "switch" },
    });
    return { ok: true, confirmationUrl: checkout.confirmationUrl };
  } catch (e) {
    console.error("switchPlan: ошибка создания платежа", e);
    return { ok: false, error: "PROVIDER_ERROR" };
  }
}

// Отключить автопродление. Доступ сохраняется до конца уже оплаченного периода
// (status CANCELED → продление не запускаем, по окончании периода EXPIRED). Деньги
// не списываются и не возвращаются. Идемпотентно (updateMany по активной подписке).
export async function cancelAutoRenew(): Promise<void> {
  const { playerId } = await requireSession();
  await prisma.subscription.updateMany({
    where: { playerId, deletedAt: null, status: "ACTIVE" },
    data: { status: "CANCELED" },
  });
  revalidatePath("/account");
}

// Включить автопродление обратно (пока оплаченный период ещё не истёк — иначе подписка
// уже EXPIRED и нужно оформлять заново).
export async function resumeAutoRenew(): Promise<void> {
  const { playerId } = await requireSession();
  await prisma.subscription.updateMany({
    where: { playerId, deletedAt: null, status: "CANCELED" },
    data: { status: "ACTIVE" },
  });
  revalidatePath("/account");
}

// Отменить запланированную смену тарифа (даунгрейд) — остаёмся на текущем тарифе.
export async function cancelScheduledPlan(): Promise<void> {
  const { playerId } = await requireSession();
  await prisma.subscription.updateMany({
    where: { playerId, deletedAt: null },
    data: { scheduledPlanCode: null },
  });
  revalidatePath("/account");
}

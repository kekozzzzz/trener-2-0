"use server";

// Серверные экшены подписки. Точка входа из UI (страница тарифов / личный кабинет).
// Само создание платежа делегируется порту платежей (правило 4) — здесь только
// авторизация, выбор тарифа из конфига и сборка параметров.

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/features/auth/session";
import { getPlan, getCurrency, getSubscriptionPeriodDays, usdToKopecks } from "@/config/plans";
import { getAppBaseUrl } from "@/config/app";
import { getPaymentsAdapter } from "@/infrastructure/adapters/payments";
import { isRecurringEnabled } from "@/config/payments";
import { getExchangeRateAdapter } from "@/infrastructure/adapters/exchange-rate";
import { prisma } from "@/infrastructure/db/client";
import { getSubscriptionState } from "@/features/subscription/access";
import { proratedUpgradeKopecks } from "@/features/subscription/proration";

export type StartCheckoutResult =
  | { ok: true; confirmationUrl: string }
  | { ok: false; error: "UNKNOWN_PLAN" | "PROVIDER_ERROR" };

// Создать первый платёж подписки по выбранному тарифу и вернуть ссылку на оплату.
// recurring=true — подписка с автопродлением: просим сохранить карту (форма ЮKassa
// покажет только карту — только её можно «запомнить»). recurring=false — разовая оплата
// любым способом (СБП/кошелёк/карта), карта не сохраняется, автосписания не будет.
// Сохранение карты возможно лишь когда у магазина включён рекуррент (isRecurringEnabled).
export async function startCheckout(
  planCode: string,
  recurring: boolean,
): Promise<StartCheckoutResult> {
  const { playerId } = await requireSession();

  const plan = getPlan(planCode);
  if (!plan) return { ok: false, error: "UNKNOWN_PLAN" };

  // Свой ключ идемпотентности на каждую попытку оплаты — ЮKassa не создаст второй
  // платёж, если этот же запрос повторится (сетевой ретрай).
  const idempotenceKey = randomUUID();

  // Цена тарифа в долларах → рубли по курсу ЦБ на момент оплаты.
  const rate = await getExchangeRateAdapter().getUsdRub();
  const amountKopecks = usdToKopecks(plan.priceUsd, rate);

  try {
    const checkout = await getPaymentsAdapter().createCheckout({
      idempotenceKey,
      money: { amountKopecks, currency: getCurrency() },
      description: `Подписка «${plan.title}» — whygrid`,
      returnUrl: `${getAppBaseUrl()}/account`,
      savePaymentMethod: recurring && isRecurringEnabled(),
      metadata: { playerId, planCode: plan.code },
    });
    return { ok: true, confirmationUrl: checkout.confirmationUrl };
  } catch (e) {
    console.error("startCheckout: ошибка создания платежа", e);
    return { ok: false, error: "PROVIDER_ERROR" };
  }
}

// Минимальная доплата, которую есть смысл проводить через ЮKassa. Если пропорциональная
// разница за остаток периода меньше — апгрейд применяем сразу без оплаты (полную цену
// нового тарифа человек заплатит при ближайшем автопродлении).
const MIN_CHARGE_KOPECKS = 100; // 1 ₽

export type SwitchPlanResult =
  | { ok: true; confirmationUrl: string }
  // Даунгрейд (более дешёвый тариф) запланирован: вступит в силу со следующего периода
  // при автопродлении (scheduledPlanCode). Деньги сейчас не списываем.
  | { ok: true; scheduled: true }
  // Апгрейд применён сразу без оплаты (доплата за остаток периода — копейки).
  | { ok: true; applied: true }
  | {
      ok: false;
      error: "UNKNOWN_PLAN" | "SAME_PLAN" | "NO_SUBSCRIPTION" | "PROVIDER_ERROR";
    };

// Сменить тариф активной подписке. Апгрейд (дороже) — сразу, в текущем периоде: новый
// тариф (и бюджет) действует немедленно, доплачивается лишь РАЗНИЦА цен за остаток дней
// (Stripe-style, proration.ts). Период НЕ перезапускается, метр бюджета не сбрасывается —
// бюджеты тарифов не суммируются «лесенкой». Даунгрейд — со следующего периода.
// Применение switch к текущему периоду делает applySucceededPayment по intent="switch".
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
  // Сравниваем по цене в долларах (не зависит от курса).
  if (newPlan.priceUsd < currentPlan.priceUsd) {
    await prisma.subscription.updateMany({
      where: { playerId, deletedAt: null },
      data: { scheduledPlanCode: newPlan.code },
    });
    revalidatePath("/account");
    return { ok: true, scheduled: true };
  }

  const now = new Date();
  const nextPaymentAt = state.subscription.nextPaymentAt ?? now;
  // Пересчёт долларовых цен тарифов в рубли по текущему курсу, затем пропорция в рублях.
  const rate = await getExchangeRateAdapter().getUsdRub();
  const chargeKopecks = proratedUpgradeKopecks(
    usdToKopecks(currentPlan.priceUsd, rate),
    usdToKopecks(newPlan.priceUsd, rate),
    nextPaymentAt,
    now,
    getSubscriptionPeriodDays(),
  );

  // Доплата за остаток периода — копейки: применяем апгрейд сразу, без оплаты. Окно
  // периода и метр не трогаем (как и в applySucceededPayment для switch).
  if (chargeKopecks < MIN_CHARGE_KOPECKS) {
    await prisma.subscription.updateMany({
      where: { playerId, deletedAt: null },
      data: { planCode: newPlan.code, scheduledPlanCode: null },
    });
    revalidatePath("/account");
    return { ok: true, applied: true };
  }

  const idempotenceKey = randomUUID();
  try {
    const checkout = await getPaymentsAdapter().createCheckout({
      idempotenceKey,
      money: { amountKopecks: chargeKopecks, currency: getCurrency() },
      description: `Переход на тариф «${newPlan.title}» — whygrid`,
      returnUrl: `${getAppBaseUrl()}/account`,
      savePaymentMethod: isRecurringEnabled(),
      metadata: { playerId, planCode: newPlan.code, intent: "switch" },
    });
    return { ok: true, confirmationUrl: checkout.confirmationUrl };
  } catch (e) {
    console.error("switchPlan: ошибка создания платежа", e);
    return { ok: false, error: "PROVIDER_ERROR" };
  }
}

// Отключить автопродление и ОТВЯЗАТЬ сохранённую карту (paymentMethodId = null).
// Требование ЮKassa для рекуррента: клиент должен мочь самостоятельно отвязать способ
// оплаты через интерфейс, без обращения в поддержку. Удаление токена и есть отвязка:
// крон автопродления такую подписку не спишет (нет карты) и по окончании периода
// закроет (EXPIRED). Доступ сохраняется до конца уже оплаченного периода. Деньги не
// списываются и не возвращаются. Идемпотентно (updateMany по активной подписке).
export async function cancelAutoRenew(): Promise<void> {
  const { playerId } = await requireSession();
  await prisma.subscription.updateMany({
    where: { playerId, deletedAt: null, status: "ACTIVE" },
    data: { status: "CANCELED", paymentMethodId: null },
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

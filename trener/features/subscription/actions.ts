"use server";

// Серверные экшены подписки. Точка входа из UI (страница тарифов / личный кабинет).
// Само создание платежа делегируется порту платежей (правило 4) — здесь только
// авторизация, выбор тарифа из конфига и сборка параметров.

import { randomUUID } from "crypto";
import { requireSession } from "@/features/auth/session";
import { getPlan, getCurrency } from "@/config/pricing";
import { getAppBaseUrl } from "@/config/app";
import { getPaymentsAdapter } from "@/infrastructure/adapters/payments";

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

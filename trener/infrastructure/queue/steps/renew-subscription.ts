import type { StepHandler } from "../types";
import { getPlan, getCurrency, usdToKopecks } from "@/config/plans";
import { getPaymentsAdapter } from "@/infrastructure/adapters/payments";
import { getExchangeRateAdapter } from "@/infrastructure/adapters/exchange-rate";
import { applySucceededPayment } from "@/features/subscription/apply-payment";

type RenewPayload = { subscriptionId: string };

// Автопродление подписки: списывает следующий период с сохранённой карты (рекуррент) и
// продлевает через applySucceededPayment (тот же путь, что вебхук — новый период с
// обнулением метра бюджета). Запланированный даунгрейд (scheduledPlanCode) применяется
// здесь: списываем уже по новому, более дешёвому тарифу, и снимаем пометку.
//
// Идемпотентность: детерминированный ключ на период (renew-<sub>-<nextPaymentAt>) — даже
// если задача попадёт в очередь дважды, ЮKassa по тому же ключу не спишет повторно, а
// applySucceededPayment не проведёт второй платёж (уникальный external_payment_id).
//
// Без грейса (решение Артёма 2026-06-22): карта отклонена → EXPIRED, доступ прекращается.
// Транзиентные ошибки (сеть) — это throw → ретрай очереди, не EXPIRED.
export const renewSubscriptionStep: StepHandler = async (task, db) => {
  const { subscriptionId } = task.payload as RenewPayload;

  const sub = await db.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub || sub.deletedAt) return; // удалена — продлевать нечего
  if (sub.status !== "ACTIVE") return; // отменена/просрочена — не продлеваем
  // Период ещё не истёк (уже продлили или задача рано) — пропускаем без списания.
  if (sub.nextPaymentAt && sub.nextPaymentAt > new Date()) return;

  // Тариф следующего периода: запланированный даунгрейд имеет приоритет над текущим.
  const effectivePlanCode = sub.scheduledPlanCode ?? sub.planCode;
  const plan = getPlan(effectivePlanCode);

  // Нечем списать (нет сохранённой карты) или неизвестный тариф → доступ прекращаем.
  if (!sub.paymentMethodId || !plan) {
    await db.subscription.update({ where: { id: sub.id }, data: { status: "EXPIRED" } });
    return;
  }

  const idempotenceKey = `renew-${sub.id}-${sub.nextPaymentAt?.toISOString() ?? "init"}`;
  const adapter = getPaymentsAdapter();

  // Цена тарифа в долларах → рубли по курсу ЦБ на день списания.
  const rate = await getExchangeRateAdapter().getUsdRub();
  const amountKopecks = usdToKopecks(plan.priceUsd, rate);

  const charge = await adapter.chargeSaved({
    idempotenceKey,
    paymentMethodId: sub.paymentMethodId,
    money: { amountKopecks, currency: getCurrency() },
    description: `Продление подписки «${plan.title}» — whygrid`,
    metadata: { playerId: sub.playerId, planCode: plan.code },
  });

  // Карта отклонена → доступ прекращаем сразу (без грейса).
  if (charge.status === "canceled") {
    await db.subscription.update({ where: { id: sub.id }, data: { status: "EXPIRED" } });
    return;
  }

  // Перечитываем платёж у провайдера (не доверяем — как в вебхуке) и применяем.
  const payment = await adapter.getPayment(charge.externalPaymentId);
  const result = await applySucceededPayment(payment);
  if (result === "ignored") {
    // Не succeeded (pending/иное) — бросаем, чтобы очередь повторила позже.
    throw new Error(
      `Продление ${sub.id}: платёж ${charge.externalPaymentId} не оплачен (status=${payment.status})`,
    );
  }

  // Применили продление — запланированный даунгрейд стал текущим тарифом, снимаем пометку.
  if (sub.scheduledPlanCode) {
    await db.subscription.update({ where: { id: sub.id }, data: { scheduledPlanCode: null } });
  }
};

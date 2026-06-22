// Применение успешного платежа к подписке — общая идемпотентная операция,
// которой пользуются обработчик вебхука ЮKassa (сейчас) и суточная сверка
// (Фаза 4). Здесь — единственное место, где успешная оплата активирует/продлевает
// подписку и пишет проводку в журнал платежей.
//
// Идемпотентность (одно уведомление = одна проводка, правило проекта): проводка в
// payments создаётся с уникальным external_payment_id. Повторный вебхук о том же
// платеже бросит unique-violation (P2002), вся транзакция откатится — повторного
// продления периода не произойдёт.

import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";
import { getSubscriptionPeriodDays, isPlanCode, getPlan, getCurrency } from "@/config/plans";
import type { ProviderPayment } from "@/infrastructure/adapters/payments";

const DAY_MS = 24 * 60 * 60 * 1000;

// applied — подписка активирована/продлена и проводка записана;
// duplicate — этот платёж уже был проведён, ничего не меняли (идемпотентно);
// ignored — платёж не в статусе «оплачен», игнорируем.
export type ApplyPaymentResult = "applied" | "duplicate" | "ignored";

export async function applySucceededPayment(payment: ProviderPayment): Promise<ApplyPaymentResult> {
  if (!payment.paid || payment.status !== "succeeded") return "ignored";

  const playerId = payment.metadata.playerId;
  const planCode = payment.metadata.planCode;
  if (!playerId || !planCode || !isPlanCode(planCode)) {
    // metadata формируем мы сами при создании платежа — отсутствие/мусор здесь
    // означает баг на нашей стороне, а не валидный платёж. Бросаем, чтобы вебхук
    // вернул не-200 и ЮKassa повторила (а мы увидели ошибку в логах).
    throw new Error(
      `Платёж ${payment.externalPaymentId}: некорректные metadata (playerId=${playerId}, planCode=${planCode})`,
    );
  }

  // Смена тарифа в середине периода: оплачена ПРОПОРЦИОНАЛЬНАЯ разница, а не полная
  // цена тарифа, и новый период должен стартовать сегодня (а не продлевать текущий).
  const isSwitch = payment.metadata.intent === "switch";

  // Защита в глубину: сумма и planCode формируются на сервере из одного getPlan, но
  // если оплаченное расходится с ценой тарифа (баг/смена цены/иной валюты) — это
  // аномалия, которую надо заметить. Активацию НЕ блокируем (платёж реален, по
  // planCode понятно, что человек покупал, а жёсткий отказ отверг бы реальные деньги),
  // но пишем предупреждение для разбора/сверки. Для switch расхождение ОЖИДАЕМО
  // (списана разница по пропорции), поэтому предупреждение не пишем.
  const plan = getPlan(planCode);
  if (
    !isSwitch &&
    plan &&
    (payment.money.amountKopecks !== plan.amountKopecks || payment.money.currency !== getCurrency())
  ) {
    console.warn(
      `Платёж ${payment.externalPaymentId}: сумма ${payment.money.amountKopecks} ${payment.money.currency} не совпадает с тарифом «${planCode}» (${plan.amountKopecks} ${getCurrency()})`,
    );
  }

  const periodMs = getSubscriptionPeriodDays() * DAY_MS;
  const paidAt = payment.capturedAt ?? new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { playerId } });

      // Продление активной подписки (оплата ДО конца текущего периода): новый
      // оплаченный период приклеивается к концу текущего, поэтому nextPaymentAt
      // считаем от его конца (base). Просроченная/новая — период стартует с оплаты.
      // Смена тарифа (switch) применяется к ТЕКУЩЕМУ периоду: окно периода НЕ трогаем —
      // ни срок (nextPaymentAt), ни якорь метра (currentPeriodStart). Меняется только
      // план (→ новый бюджет). Это ключ к защите от «лесенки»: метр не сбрасывается, уже
      // потраченное за период считается против нового бюджета, поэтому бюджеты тарифов не
      // суммируются. Доплачена лишь разница за остаток дней (см. proration.ts); полную
      // цену нового тарифа человек заплатит при автопродлении.
      const keepWindow = isSwitch && existing?.nextPaymentAt != null;
      const activeUntil = existing?.nextPaymentAt;
      const extending = !isSwitch && activeUntil != null && activeUntil > paidAt;
      const base = extending ? activeUntil : paidAt;
      const nextPaymentAt = keepWindow ? existing!.nextPaymentAt! : new Date(base.getTime() + periodMs);

      // ВАЖНО (бюджет-гейт, безопасность): currentPeriodStart — это якорь МЕТРА
      // расхода (budget.ts считает потраченное «с начала периода»). При раннем
      // продлении его НЕЛЬЗЯ двигать в будущее (= конец текущего периода): иначе окно
      // отсчёта стартовало бы позже «сейчас», метр читал бы 0 и стена снималась бы до
      // конца периода — бюджет-байпас. Поэтому при продлении активной подписки (и при
      // смене тарифа) якорь оставляем на начале ТЕКУЩЕГО периода; сбрасываем (на paidAt)
      // только когда период реально начинается заново (новая/просроченная подписка).
      // (Перекат метра на следующий период при стекинге доплат — за Фазой 4
      // автопродления/сверки; пока стекинг метрится консервативно в нашу пользу.)
      const currentPeriodStart =
        (extending || keepWindow) && existing ? existing.currentPeriodStart : paidAt;

      let subscriptionId: string;
      if (existing) {
        const updated = await tx.subscription.update({
          where: { playerId },
          data: {
            status: "ACTIVE",
            planCode,
            currentPeriodStart,
            nextPaymentAt,
            // Смена тарифа отменяет ранее запланированный даунгрейд: иначе апгрейд
            // поверх запланированного понижения откатил бы тариф на следующем продлении.
            // Для продления (не switch) пометку трогает шаг RENEW_SUBSCRIPTION.
            ...(isSwitch ? { scheduledPlanCode: null } : {}),
            // Сохранённый метод обновляем только если пришёл новый (первая оплата
            // его отдаёт; рекуррентное списание — нет, оставляем прежний).
            paymentMethodId: payment.paymentMethodId ?? existing.paymentMethodId,
            deletedAt: null,
          },
        });
        subscriptionId = updated.id;
      } else {
        const created = await tx.subscription.create({
          data: {
            playerId,
            status: "ACTIVE",
            planCode,
            currentPeriodStart,
            nextPaymentAt,
            // У ЮKassa нет объекта «подписка» — идентичность рекуррента несёт
            // сохранённый токен карты. Если карта не сохранена — падаем на id
            // платежа (поле уникальное и обязательное).
            externalSubscriptionId: payment.paymentMethodId ?? payment.externalPaymentId,
            paymentMethodId: payment.paymentMethodId ?? null,
            paymentProvider: "yookassa",
          },
        });
        subscriptionId = created.id;
      }

      // Проводка в журнал. external_payment_id уникален → повтор бросит P2002 и
      // откатит всю транзакцию (включая продление выше) — идемпотентность.
      await tx.payment.create({
        data: {
          subscriptionId,
          externalPaymentId: payment.externalPaymentId,
          amountCents: payment.money.amountKopecks,
          currency: payment.money.currency,
          status: "SUCCEEDED",
          occurredAt: paidAt,
        },
      });

      return "applied" as const;
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return "duplicate";
    }
    throw e;
  }
}

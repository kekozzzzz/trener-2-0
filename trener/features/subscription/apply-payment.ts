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
import { getSubscriptionPeriodDays, isPlanCode } from "@/config/pricing";
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

  const periodMs = getSubscriptionPeriodDays() * DAY_MS;
  const paidAt = payment.capturedAt ?? new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.subscription.findUnique({ where: { playerId } });

      // Новый оплаченный период стартует с конца текущего оплаченного (продление)
      // либо с момента оплаты (первая подписка / просроченная).
      const base =
        existing?.nextPaymentAt && existing.nextPaymentAt > paidAt ? existing.nextPaymentAt : paidAt;
      const nextPaymentAt = new Date(base.getTime() + periodMs);

      let subscriptionId: string;
      if (existing) {
        const updated = await tx.subscription.update({
          where: { playerId },
          data: {
            status: "ACTIVE",
            planCode,
            currentPeriodStart: base,
            nextPaymentAt,
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
            currentPeriodStart: base,
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

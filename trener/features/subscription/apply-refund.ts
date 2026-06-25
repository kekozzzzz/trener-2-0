// Применение возврата к подписке — зеркало applySucceededPayment для обратной
// операции. Единственное место, где успешный возврат снимает доступ и пишет проводку
// в финансовую ленту. Пользуется обработчик вебхука ЮKassa (событие refund.succeeded).
//
// Идемпотентность (одно уведомление = одна проводка, правило проекта): проводка
// возврата пишется НОВОЙ строкой с external_payment_id = id возврата (он уникален у
// провайдера). Лента payments — append-only (schema.prisma: «никогда не удаляется и не
// изменяется»), поэтому исходную проводку об оплате не трогаем. Повторный вебхук о том
// же возврате бросит unique-violation (P2002) — вся транзакция откатится, доступ
// повторно не снимется.

import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";
import type { ProviderRefund } from "@/infrastructure/adapters/payments";

// applied — доступ снят и проводка возврата записана;
// duplicate — этот возврат уже проведён, ничего не меняли (идемпотентно);
// ignored — возврат не в статусе succeeded ИЛИ исходный платёж не наш/не записан.
export type ApplyRefundResult = "applied" | "duplicate" | "ignored";

export async function applyRefund(refund: ProviderRefund): Promise<ApplyRefundResult> {
  if (refund.status !== "succeeded") return "ignored";

  try {
    return await prisma.$transaction(async (tx) => {
      // Находим свою проводку об оплате, которую вернули (по id исходного платежа).
      const payment = await tx.payment.findUnique({
        where: { externalPaymentId: refund.paymentId },
        select: { subscriptionId: true },
      });
      // Платёж не наш или не записан — снимать нечего (вебхук вернёт 200, без проводки).
      if (!payment) return "ignored" as const;

      // Проводка возврата — НОВАЯ строка ленты (id возврата уникален → повтор бросит
      // P2002 и откатит транзакцию = идемпотентность). Сумму храним положительной;
      // знак операции несёт статус REFUNDED.
      await tx.payment.create({
        data: {
          subscriptionId: payment.subscriptionId,
          externalPaymentId: refund.refundId,
          amountCents: refund.money.amountKopecks,
          currency: refund.money.currency,
          status: "REFUNDED",
          occurredAt: new Date(),
        },
      });

      // Снимаем доступ. EXPIRED (а не CANCELED) выбран намеренно: в access.ts
      // hasAccess = status !== "EXPIRED" && periodValid — EXPIRED рвёт доступ сразу,
      // тогда как CANCELED оставляет его до конца оплаченного периода (отмена
      // автопродления ≠ возврат денег). nextPaymentAt закрываем текущим моментом, чтобы
      // и гейт потребления (budget.ts: требует nextPaymentAt > now), и показ срока в
      // кабинете были согласованы. currentPeriodStart (якорь метра расхода) не трогаем.
      await tx.subscription.update({
        where: { id: payment.subscriptionId },
        data: { status: "EXPIRED", nextPaymentAt: new Date() },
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

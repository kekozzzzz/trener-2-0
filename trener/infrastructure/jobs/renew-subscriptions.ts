import type { PrismaClient } from "@prisma/client";
import { enqueue } from "@/infrastructure/queue";

// Биллинг-крон: раз в период (например, ежечасно) находит подписки, у которых
// оплаченный период истёк, и (1) ставит задачу автопродления на те, что можно списать,
// (2) гасит в EXPIRED те, что продлить нельзя (отменён автоплатёж или нет карты).
//
// Само списание — в шаге очереди RENEW_SUBSCRIPTION (с ретраями); здесь только постановка
// задач и закрытие безнадёжных. Доступ к платным ИИ-действиям и так прекращается ровно в
// nextPaymentAt (гейт budget.ts проверяет срок) — смена статуса здесь это лишь фиксирует.

export type RenewalSweepResult = { enqueued: number; expired: number };

export async function runSubscriptionRenewals(db: PrismaClient): Promise<RenewalSweepResult> {
  const now = new Date();

  // 1. К продлению: активные, период истёк, есть сохранённая карта.
  const due = await db.subscription.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      paymentMethodId: { not: null },
      nextPaymentAt: { lte: now },
    },
    select: { id: true },
  });

  let enqueued = 0;
  for (const s of due) {
    // Дедуп: не плодим вторую задачу, если по этой подписке уже есть незавершённая
    // (повторное списание защищено и ключом идемпотентности, но лишние задачи ни к чему).
    const pending = await db.task.findFirst({
      where: {
        type: "RENEW_SUBSCRIPTION",
        status: { in: ["PENDING", "PROCESSING"] },
        payload: { path: ["subscriptionId"], equals: s.id },
      },
      select: { id: true },
    });
    if (pending) continue;
    await enqueue(db, { type: "RENEW_SUBSCRIPTION", payload: { subscriptionId: s.id } });
    enqueued++;
  }

  // 2. Просроченные, которые не продлить → EXPIRED (без грейса): отменённый автоплатёж
  //    или активная подписка без сохранённой карты.
  const { count: expired } = await db.subscription.updateMany({
    where: {
      deletedAt: null,
      nextPaymentAt: { lt: now },
      OR: [{ status: "CANCELED" }, { status: "ACTIVE", paymentMethodId: null }],
    },
    data: { status: "EXPIRED" },
  });

  return { enqueued, expired };
}

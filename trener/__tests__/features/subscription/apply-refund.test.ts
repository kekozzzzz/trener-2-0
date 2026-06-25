/**
 * Тесты applyRefund (features/subscription/apply-refund) — снятие доступа при возврате
 * и идемпотентность проводки. Реальная тестовая база (trener_test), как в остальных
 * feature-тестах. Исходную оплату создаём через applySucceededPayment — так проверяем
 * связку «оплатил → доступ → вернули → доступа нет» целиком.
 *
 * Покрывают:
 *  1. Успешный возврат оплаченного платежа → подписка EXPIRED, период закрыт сейчас,
 *     в ленте появляется проводка REFUNDED (исходная SUCCEEDED не тронута).
 *  2. Повтор того же id возврата → "duplicate": вторая проводка не пишется.
 *  3. Возврат не в статусе succeeded → "ignored", ничего не меняем.
 *  4. Возврат платежа, которого нет в нашей ленте → "ignored", ничего не создаём.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { prisma } from "@/infrastructure/db/client";
import { applySucceededPayment } from "@/features/subscription/apply-payment";
import { applyRefund } from "@/features/subscription/apply-refund";
import type { ProviderPayment, ProviderRefund } from "@/infrastructure/adapters/payments";

const PLAYER_ID = "22222222-0000-0000-0000-000000000009";
const PAYMENT_ID = "pay_refund_test_1";

function payment(overrides: Partial<ProviderPayment> = {}): ProviderPayment {
  return {
    externalPaymentId: PAYMENT_ID,
    status: "succeeded",
    paid: true,
    money: { amountKopecks: 69_000, currency: "RUB" },
    paymentMethodId: "pm_refund_test_1",
    metadata: { playerId: PLAYER_ID, planCode: "basic" },
    capturedAt: new Date("2026-06-25T10:00:00.000Z"),
    ...overrides,
  };
}

function refund(overrides: Partial<ProviderRefund> = {}): ProviderRefund {
  return {
    refundId: "refund_test_1",
    paymentId: PAYMENT_ID,
    status: "succeeded",
    money: { amountKopecks: 69_000, currency: "RUB" },
    ...overrides,
  };
}

async function cleanup(): Promise<void> {
  // FK Restrict: сначала платежи, потом подписки.
  const subs = await prisma.subscription.findMany({ where: { playerId: PLAYER_ID }, select: { id: true } });
  await prisma.payment.deleteMany({ where: { subscriptionId: { in: subs.map((s) => s.id) } } });
  await prisma.subscription.deleteMany({ where: { playerId: PLAYER_ID } });
}

beforeAll(async () => {
  await prisma.player.upsert({
    where: { id: PLAYER_ID },
    update: {},
    create: { id: PLAYER_ID, email: "test-apply-refund@trener.local" },
  });
});

beforeEach(cleanup);

afterAll(async () => {
  await cleanup();
  await prisma.player.delete({ where: { id: PLAYER_ID } }).catch(() => {});
  await prisma.$disconnect();
});

describe("applyRefund", () => {
  it("успешный возврат снимает доступ и пишет проводку REFUNDED", async () => {
    await applySucceededPayment(payment());

    const result = await applyRefund(refund());
    expect(result).toBe("applied");

    const sub = await prisma.subscription.findUnique({ where: { playerId: PLAYER_ID } });
    expect(sub?.status).toBe("EXPIRED");
    // Период закрыт «сейчас» — доступ не тянется до будущей даты.
    expect(sub!.nextPaymentAt!.getTime()).toBeLessThanOrEqual(Date.now() + 1000);

    const ledger = await prisma.payment.findMany({
      where: { subscriptionId: sub!.id },
      orderBy: { createdAt: "asc" },
    });
    // Исходная проводка SUCCEEDED не тронута, возврат — отдельной строкой.
    expect(ledger.map((p) => p.status)).toEqual(["SUCCEEDED", "REFUNDED"]);
    const refundRow = ledger.find((p) => p.status === "REFUNDED");
    expect(refundRow?.externalPaymentId).toBe("refund_test_1");
  });

  it("повтор того же возврата → duplicate, второй проводки нет", async () => {
    await applySucceededPayment(payment());
    await applyRefund(refund());

    const result = await applyRefund(refund());
    expect(result).toBe("duplicate");

    const sub = await prisma.subscription.findUnique({ where: { playerId: PLAYER_ID } });
    const refundRows = await prisma.payment.count({
      where: { subscriptionId: sub!.id, status: "REFUNDED" },
    });
    expect(refundRows).toBe(1);
  });

  it("возврат не в статусе succeeded → ignored, доступ не трогаем", async () => {
    await applySucceededPayment(payment());

    const result = await applyRefund(refund({ status: "pending" }));
    expect(result).toBe("ignored");

    const sub = await prisma.subscription.findUnique({ where: { playerId: PLAYER_ID } });
    expect(sub?.status).toBe("ACTIVE");
  });

  it("возврат платежа не из нашей ленты → ignored, ничего не создаём", async () => {
    const result = await applyRefund(refund({ paymentId: "pay_unknown_999" }));
    expect(result).toBe("ignored");

    const sub = await prisma.subscription.findFirst({ where: { playerId: PLAYER_ID } });
    expect(sub).toBeNull();
  });
});

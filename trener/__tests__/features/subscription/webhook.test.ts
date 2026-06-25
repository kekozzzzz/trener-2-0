/**
 * Тесты обработчика вебхука ЮKassa (app/api/webhooks/yookassa/route).
 *
 * Покрывают:
 *  1. event=payment.*: из тела берётся только id; статус перечитывается через
 *     getPayment; затем вызывается applySucceededPayment с перечитанным платежом → 200.
 *  2. Тело без id объекта → 200, ничего не вызывается.
 *  3. Включён IP-аллоулист, адрес не из списка → 403 (объект не трогаем).
 *  4. getPayment бросает → 500 (ЮKassa повторит доставку).
 *  5. event=refund.succeeded: возврат перечитывается через getRefund и применяется
 *     через applyRefund → 200 (платёжный путь не трогаем).
 *  6. Прочие/неизвестные события → 200, ни один объект не читаем (ЮKassa не повторяет).
 *
 * Адаптер платежей и applySucceededPayment/applyRefund замоканы — ни сети, ни БД.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import type { ProviderPayment, ProviderRefund } from "@/infrastructure/adapters/payments";

const { getPaymentMock, getRefundMock, applyMock, applyRefundMock } = vi.hoisted(() => ({
  getPaymentMock: vi.fn(),
  getRefundMock: vi.fn(),
  applyMock: vi.fn(),
  applyRefundMock: vi.fn(),
}));

vi.mock("@/infrastructure/adapters/payments", () => ({
  getPaymentsAdapter: () => ({ getPayment: getPaymentMock, getRefund: getRefundMock }),
}));

vi.mock("@/features/subscription/apply-payment", () => ({
  applySucceededPayment: applyMock,
}));

vi.mock("@/features/subscription/apply-refund", () => ({
  applyRefund: applyRefundMock,
}));

import { POST } from "@/app/api/webhooks/yookassa/route";

const SUCCEEDED: ProviderPayment = {
  externalPaymentId: "pay_x",
  status: "succeeded",
  paid: true,
  money: { amountKopecks: 90_000, currency: "RUB" },
  paymentMethodId: "pm_x",
  metadata: { playerId: "p1", planCode: "basic" },
  capturedAt: new Date("2026-06-19T10:00:00.000Z"),
};

function webhookReq(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/yookassa", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const REFUND: ProviderRefund = {
  refundId: "refund_x",
  paymentId: "pay_x",
  status: "succeeded",
  money: { amountKopecks: 90_000, currency: "RUB" },
};

beforeEach(() => {
  delete process.env.YOOKASSA_WEBHOOK_IPS;
  getPaymentMock.mockReset();
  getRefundMock.mockReset();
  applyMock.mockReset();
  applyRefundMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs?.();
});

describe("POST /api/webhooks/yookassa", () => {
  it("перечитывает платёж по id из тела и применяет его", async () => {
    getPaymentMock.mockResolvedValue(SUCCEEDED);
    applyMock.mockResolvedValue("applied");

    const res = await POST(webhookReq({ event: "payment.succeeded", object: { id: "pay_x", status: "succeeded" } }));

    expect(res.status).toBe(200);
    expect(getPaymentMock).toHaveBeenCalledWith("pay_x");
    expect(applyMock).toHaveBeenCalledWith(SUCCEEDED);
  });

  it("тело без id платежа → 200 и ничего не применяем", async () => {
    const res = await POST(webhookReq({ event: "payment.succeeded", object: {} }));
    expect(res.status).toBe(200);
    expect(getPaymentMock).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("мусорный id (инъекция пути) → 200 и платёж не перечитываем", async () => {
    const res = await POST(
      webhookReq({ object: { id: "../../secret-endpoint" } }),
    );
    expect(res.status).toBe(200);
    expect(getPaymentMock).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("IP-аллоулист включён, адрес не из списка → 403", async () => {
    process.env.YOOKASSA_WEBHOOK_IPS = "185.71.76.0/27";
    const res = await POST(
      webhookReq({ object: { id: "pay_x" } }, { "x-forwarded-for": "8.8.8.8" }),
    );
    expect(res.status).toBe(403);
    expect(getPaymentMock).not.toHaveBeenCalled();
  });

  it("ошибка getPayment → 500 (ЮKassa повторит)", async () => {
    getPaymentMock.mockRejectedValue(new Error("network"));
    const res = await POST(webhookReq({ event: "payment.succeeded", object: { id: "pay_x" } }));
    expect(res.status).toBe(500);
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("event=refund.succeeded: перечитывает возврат и применяет его, платёж не трогает", async () => {
    getRefundMock.mockResolvedValue(REFUND);
    applyRefundMock.mockResolvedValue("applied");

    const res = await POST(webhookReq({ event: "refund.succeeded", object: { id: "refund_x" } }));

    expect(res.status).toBe(200);
    expect(getRefundMock).toHaveBeenCalledWith("refund_x");
    expect(applyRefundMock).toHaveBeenCalledWith(REFUND);
    expect(getPaymentMock).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
  });

  it("прочее событие (refund.canceled и т.п.) → 200, ничего не читаем", async () => {
    const res = await POST(webhookReq({ event: "refund.canceled", object: { id: "refund_x" } }));

    expect(res.status).toBe(200);
    expect(getPaymentMock).not.toHaveBeenCalled();
    expect(getRefundMock).not.toHaveBeenCalled();
    expect(applyMock).not.toHaveBeenCalled();
    expect(applyRefundMock).not.toHaveBeenCalled();
  });
});

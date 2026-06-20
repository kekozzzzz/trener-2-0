/**
 * Тесты адаптера ЮKassa (infrastructure/adapters/payments/yookassa).
 *
 * Покрывают:
 *  1. createCheckout шлёт корректный POST /payments: Basic-авторизация,
 *     Idempotence-Key, сумма строкой "900.00", capture, confirmation.redirect +
 *     return_url, save_payment_method, metadata; парсит confirmation_url и id.
 *  2. chargeSaved (рекуррент) кладёт payment_method_id и НЕ шлёт confirmation.
 *  3. getPayment делает GET, маппит статус, деньги (рубли→копейки) и
 *     payment_method_id только когда карта сохранена (saved: true).
 *  4. createCheckout без confirmation_url в ответе — бросает.
 *  5. Не-2xx ответ — бросает (очередь увидит причину).
 *
 * Сеть не трогаем — global.fetch замокан.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { yooKassaPaymentsAdapter } from "@/infrastructure/adapters/payments/yookassa";

const ENV_KEYS = ["YOOKASSA_SHOP_ID", "YOOKASSA_SECRET_KEY", "YOOKASSA_API_URL"] as const;
const savedEnv: Record<string, string | undefined> = {};

const EXPECTED_AUTH = "Basic " + Buffer.from("shop_123:secret_xyz").toString("base64");

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.YOOKASSA_SHOP_ID = "shop_123";
  process.env.YOOKASSA_SECRET_KEY = "secret_xyz";
  process.env.YOOKASSA_API_URL = "https://api.yookassa.test/v3";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function okJson(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as Response;
}

describe("yooKassaPaymentsAdapter.createCheckout", () => {
  it("шлёт корректный POST /payments и парсит confirmation_url", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({
        id: "pay_1",
        status: "pending",
        paid: false,
        amount: { value: "900.00", currency: "RUB" },
        confirmation: { confirmation_url: "https://yoomoney.test/checkout/pay_1" },
        metadata: { playerId: "p1", planCode: "basic" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await yooKassaPaymentsAdapter.createCheckout({
      idempotenceKey: "idem-1",
      money: { amountKopecks: 90_000, currency: "RUB" },
      description: "Подписка «Базовый»",
      returnUrl: "https://whygrid.app/account",
      savePaymentMethod: true,
      metadata: { playerId: "p1", planCode: "basic" },
    });

    expect(result).toEqual({
      externalPaymentId: "pay_1",
      confirmationUrl: "https://yoomoney.test/checkout/pay_1",
      status: "pending",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.yookassa.test/v3/payments");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(EXPECTED_AUTH);
    expect(init.headers["Idempotence-Key"]).toBe("idem-1");
    expect(init.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init.body);
    expect(body.amount).toEqual({ value: "900.00", currency: "RUB" });
    expect(body.capture).toBe(true);
    expect(body.confirmation).toEqual({ type: "redirect", return_url: "https://whygrid.app/account" });
    expect(body.save_payment_method).toBe(true);
    expect(body.metadata).toEqual({ playerId: "p1", planCode: "basic" });
  });

  it("бросает, если ЮKassa не вернул confirmation_url", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okJson({ id: "pay_2", status: "pending", paid: false, amount: { value: "900.00", currency: "RUB" } }),
      ),
    );
    await expect(
      yooKassaPaymentsAdapter.createCheckout({
        idempotenceKey: "idem-2",
        money: { amountKopecks: 90_000, currency: "RUB" },
        description: "x",
        returnUrl: "https://whygrid.app/account",
        savePaymentMethod: true,
        metadata: {},
      }),
    ).rejects.toThrow(/confirmation_url/);
  });

  it("бросает на не-2xx ответе", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ type: "error", code: "invalid_request" }),
      } as Response),
    );
    await expect(
      yooKassaPaymentsAdapter.createCheckout({
        idempotenceKey: "idem-3",
        money: { amountKopecks: 90_000, currency: "RUB" },
        description: "x",
        returnUrl: "https://whygrid.app/account",
        savePaymentMethod: false,
        metadata: {},
      }),
    ).rejects.toThrow(/400/);
  });
});

describe("yooKassaPaymentsAdapter.chargeSaved", () => {
  it("кладёт payment_method_id и не шлёт confirmation (рекуррент)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({
        id: "pay_renew",
        status: "succeeded",
        paid: true,
        amount: { value: "2000.00", currency: "RUB" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await yooKassaPaymentsAdapter.chargeSaved({
      idempotenceKey: "renew-1",
      paymentMethodId: "pm_1",
      money: { amountKopecks: 200_000, currency: "RUB" },
      description: "Продление «Средний»",
      metadata: { playerId: "p1", planCode: "standard" },
    });

    expect(result).toEqual({ externalPaymentId: "pay_renew", status: "succeeded" });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.payment_method_id).toBe("pm_1");
    expect(body.amount).toEqual({ value: "2000.00", currency: "RUB" });
    expect(body.capture).toBe(true);
    expect(body.confirmation).toBeUndefined();
    expect(init.headers["Idempotence-Key"]).toBe("renew-1");
  });
});

describe("yooKassaPaymentsAdapter.getPayment", () => {
  it("GET с авторизацией, маппит статус, деньги и сохранённый метод", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson({
        id: "pay_1",
        status: "succeeded",
        paid: true,
        amount: { value: "900.00", currency: "RUB" },
        payment_method: { id: "pm_1", saved: true },
        captured_at: "2026-06-19T10:00:00.000Z",
        metadata: { playerId: "p1" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const payment = await yooKassaPaymentsAdapter.getPayment("pay_1");

    expect(payment.externalPaymentId).toBe("pay_1");
    expect(payment.status).toBe("succeeded");
    expect(payment.paid).toBe(true);
    expect(payment.money).toEqual({ amountKopecks: 90_000, currency: "RUB" });
    expect(payment.paymentMethodId).toBe("pm_1");
    expect(payment.metadata).toEqual({ playerId: "p1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.yookassa.test/v3/payments/pay_1");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe(EXPECTED_AUTH);
  });

  it("не отдаёт payment_method_id, если карта не сохранена (saved: false)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        okJson({
          id: "pay_3",
          status: "succeeded",
          paid: true,
          amount: { value: "3000.00", currency: "RUB" },
          payment_method: { id: "pm_x", saved: false },
        }),
      ),
    );
    const payment = await yooKassaPaymentsAdapter.getPayment("pay_3");
    expect(payment.paymentMethodId).toBeUndefined();
    expect(payment.money).toEqual({ amountKopecks: 300_000, currency: "RUB" });
  });
});

// Фейковый платёжный адаптер — для дев-окружения без ключей ЮKassa и для тестов.
// Не ходит в сеть: создаёт детерминированные id из ключа идемпотентности и сразу
// «оплачивает» платёж. Никаких реальных денег здесь не двигается.

import type {
  ChargeSavedParams,
  ChargeSavedResult,
  CreateCheckoutParams,
  CreateCheckoutResult,
  PaymentsPort,
  ProviderPayment,
} from "./types";

// Память на платежи в рамках процесса — чтобы getPayment мог вернуть то, что
// «создал» createCheckout/chargeSaved (для прогона потока без сети).
const created = new Map<string, ProviderPayment>();

export const fakePaymentsAdapter: PaymentsPort = {
  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const externalPaymentId = `fake_${params.idempotenceKey}`;
    created.set(externalPaymentId, {
      externalPaymentId,
      status: "succeeded",
      paid: true,
      money: params.money,
      paymentMethodId: params.savePaymentMethod ? `fake_method_${params.idempotenceKey}` : undefined,
      metadata: params.metadata,
      capturedAt: new Date(),
    });
    return {
      externalPaymentId,
      confirmationUrl: `https://example.test/fake-checkout/${externalPaymentId}`,
      status: "pending",
    };
  },

  async chargeSaved(params: ChargeSavedParams): Promise<ChargeSavedResult> {
    const externalPaymentId = `fake_${params.idempotenceKey}`;
    created.set(externalPaymentId, {
      externalPaymentId,
      status: "succeeded",
      paid: true,
      money: params.money,
      paymentMethodId: params.paymentMethodId,
      metadata: params.metadata,
      capturedAt: new Date(),
    });
    return { externalPaymentId, status: "succeeded" };
  },

  async getPayment(externalPaymentId: string): Promise<ProviderPayment> {
    const found = created.get(externalPaymentId);
    if (found) return found;
    // Неизвестный id — отдаём «оплачен», чтобы дев-поток не застревал.
    return {
      externalPaymentId,
      status: "succeeded",
      paid: true,
      money: { amountKopecks: 0, currency: "RUB" },
      metadata: {},
      capturedAt: new Date(),
    };
  },
};

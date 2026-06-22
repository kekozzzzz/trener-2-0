// Адаптер ЮKassa — реализация PaymentsPort поверх REST API ЮKassa v3.
// Сделан на fetch без отдельной библиотеки (адаптер тонкий, SDK не даёт выигрыша);
// вендор изолирован здесь, бизнес-логика знает только порт (правило проекта №4).
//
// Аутентификация — Basic (shopId:secretKey). На каждый POST, создающий деньги,
// шлём заголовок Idempotence-Key: повтор того же ключа не создаёт второй платёж
// (страховка от двойного списания, как требует архитектура платежей).
// Документация: https://yookassa.ru/developers/api

import {
  getYooKassaApiUrl,
  getYooKassaSecretKey,
  getYooKassaShopId,
} from "@/config/payments";
import type {
  ChargeSavedParams,
  ChargeSavedResult,
  CreateCheckoutParams,
  CreateCheckoutResult,
  Money,
  PaymentsPort,
  ProviderPayment,
  ProviderPaymentStatus,
} from "./types";

// Сырой ответ ЮKassa по платежу — только поля, которые мы реально используем.
type YooKassaPayment = {
  id: string;
  status: string;
  paid: boolean;
  amount: { value: string; currency: string };
  confirmation?: { confirmation_url?: string };
  payment_method?: { id: string; saved: boolean };
  captured_at?: string;
  metadata?: Record<string, string>;
};

// Копейки → строка рублей "900.00" (ЮKassa принимает сумму строкой с двумя знаками).
function kopecksToValue(amountKopecks: number): string {
  return (amountKopecks / 100).toFixed(2);
}

// Строка рублей "900.00" → копейки (целое). Округляем, чтобы не словить float-хвост.
function valueToKopecks(value: string): number {
  return Math.round(parseFloat(value) * 100);
}

// Статус ЮKassa → нормализованный статус порта. Неизвестный статус считаем
// "pending" (безопасно: не активируем подписку на том, чего не понимаем).
function mapStatus(status: string): ProviderPaymentStatus {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "canceled":
      return "canceled";
    case "waiting_for_capture":
      return "waiting_for_capture";
    default:
      return "pending";
  }
}

function authHeader(): string {
  const token = Buffer.from(`${getYooKassaShopId()}:${getYooKassaSecretKey()}`).toString("base64");
  return `Basic ${token}`;
}

function toMoney(amount: { value: string; currency: string }): Money {
  return { amountKopecks: valueToKopecks(amount.value), currency: amount.currency };
}

function toProviderPayment(p: YooKassaPayment): ProviderPayment {
  return {
    externalPaymentId: p.id,
    status: mapStatus(p.status),
    paid: p.paid,
    money: toMoney(p.amount),
    paymentMethodId: p.payment_method?.saved ? p.payment_method.id : undefined,
    metadata: p.metadata ?? {},
    capturedAt: p.captured_at ? new Date(p.captured_at) : undefined,
  };
}

// POST к ЮKassa с идемпотентностью. ЮKassa отвечает JSON и на ошибки тоже —
// при не-2xx бросаем с телом, чтобы очередь увидела причину (и ушла в карантин/повтор).
async function postPayment(body: unknown, idempotenceKey: string): Promise<YooKassaPayment> {
  const res = await fetch(`${getYooKassaApiUrl()}/payments`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Idempotence-Key": idempotenceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as YooKassaPayment & { description?: string };
  if (!res.ok) {
    throw new Error(`ЮKassa POST /payments вернул ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

export const yooKassaPaymentsAdapter: PaymentsPort = {
  async createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult> {
    const payment = await postPayment(
      {
        amount: {
          value: kopecksToValue(params.money.amountKopecks),
          currency: params.money.currency,
        },
        capture: true,
        confirmation: { type: "redirect", return_url: params.returnUrl },
        description: params.description,
        metadata: params.metadata,
        save_payment_method: params.savePaymentMethod,
      },
      params.idempotenceKey,
    );

    const confirmationUrl = payment.confirmation?.confirmation_url;
    if (!confirmationUrl) {
      throw new Error(`ЮKassa не вернул confirmation_url для платежа ${payment.id}`);
    }

    return {
      externalPaymentId: payment.id,
      confirmationUrl,
      status: mapStatus(payment.status),
    };
  },

  async chargeSaved(params: ChargeSavedParams): Promise<ChargeSavedResult> {
    const payment = await postPayment(
      {
        amount: {
          value: kopecksToValue(params.money.amountKopecks),
          currency: params.money.currency,
        },
        capture: true,
        payment_method_id: params.paymentMethodId,
        description: params.description,
        metadata: params.metadata,
      },
      params.idempotenceKey,
    );

    return {
      externalPaymentId: payment.id,
      status: mapStatus(payment.status),
    };
  },

  async getPayment(externalPaymentId: string): Promise<ProviderPayment> {
    // id экранируем: значение может прийти из внешнего источника (тело вебхука),
    // нельзя дать ему изменить путь запроса (защита от инъекции пути/SSRF).
    const res = await fetch(`${getYooKassaApiUrl()}/payments/${encodeURIComponent(externalPaymentId)}`, {
      method: "GET",
      headers: { Authorization: authHeader() },
    });
    const json = (await res.json()) as YooKassaPayment;
    if (!res.ok) {
      throw new Error(`ЮKassa GET /payments/${externalPaymentId} вернул ${res.status}: ${JSON.stringify(json)}`);
    }
    return toProviderPayment(json);
  },
};

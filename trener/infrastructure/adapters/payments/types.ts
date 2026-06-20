// Порт платежей — вендоронезависимый интерфейс приёма оплаты по подписке
// (правило проекта №4). Бизнес-логика вызывает этот порт и не знает, кто за ним:
// ЮKassa сейчас, Stripe позже — оба реализуют один и тот же интерфейс.
//
// Деньги — целое число в копейках (как Payment.amountCents в схеме), валюта —
// строка ISO ("RUB"). Никогда не float и не Decimal на границе порта.

export type Money = {
  amountKopecks: number;
  currency: string;
};

// Нормализованный статус платежа у провайдера. НЕ путать с нашим PaymentStatus
// в БД (SUCCEEDED/FAILED/REFUNDED) — это сырые стадии жизненного цикла платежа,
// которые отдаёт провайдер; маппинг в наш статус делает бизнес-логика.
export type ProviderPaymentStatus = "pending" | "waiting_for_capture" | "succeeded" | "canceled";

// Первый платёж подписки: уводит плательщика на форму провайдера и (при
// savePaymentMethod) сохраняет карту для последующих автосписаний.
export type CreateCheckoutParams = {
  idempotenceKey: string; // наш ключ идемпотентности на создание платежа
  money: Money;
  description: string; // человекочитаемое назначение — видит плательщик
  returnUrl: string; // куда вернуть пользователя после оплаты
  savePaymentMethod: boolean; // сохранить карту для рекуррента
  metadata: Record<string, string>; // playerId, planCode — вернётся в вебхуке
};

export type CreateCheckoutResult = {
  externalPaymentId: string; // id платежа у провайдера (= external_payment_id в БД)
  confirmationUrl: string; // куда редиректить плательщика для оплаты
  status: ProviderPaymentStatus;
};

// Автосписание следующего периода по ранее сохранённому методу оплаты (рекуррент),
// без участия плательщика и без редиректа.
export type ChargeSavedParams = {
  idempotenceKey: string;
  paymentMethodId: string; // сохранённый метод из первой оплаты
  money: Money;
  description: string;
  metadata: Record<string, string>;
};

export type ChargeSavedResult = {
  externalPaymentId: string;
  status: ProviderPaymentStatus;
};

// Снимок платежа у провайдера — для верификации вебхука (не доверяем телу
// уведомления, перечитываем платёж) и для суточной сверки подписок.
export type ProviderPayment = {
  externalPaymentId: string;
  status: ProviderPaymentStatus;
  paid: boolean;
  money: Money;
  paymentMethodId?: string; // присутствует, если карта сохранена для рекуррента
  metadata: Record<string, string>;
  capturedAt?: Date;
};

export interface PaymentsPort {
  // Создать первый платёж подписки и получить ссылку на оплату.
  createCheckout(params: CreateCheckoutParams): Promise<CreateCheckoutResult>;
  // Списать следующий период по сохранённому методу (рекуррент).
  chargeSaved(params: ChargeSavedParams): Promise<ChargeSavedResult>;
  // Перечитать платёж у провайдера по его id (верификация вебхука, сверка).
  getPayment(externalPaymentId: string): Promise<ProviderPayment>;
}

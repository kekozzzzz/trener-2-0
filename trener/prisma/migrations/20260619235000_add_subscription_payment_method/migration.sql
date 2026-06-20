-- Поля под автоплатёж (рекуррент) и роутинг провайдера на подписке.
-- Оба добавления безопасны: payment_method_id nullable, payment_provider с дефолтом.

-- AlterTable
ALTER TABLE "subscriptions" ADD COLUMN "payment_method_id" TEXT;
ALTER TABLE "subscriptions" ADD COLUMN "payment_provider" TEXT NOT NULL DEFAULT 'yookassa';

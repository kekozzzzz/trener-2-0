-- Метка «письмо о бездействии платящего подписчика уже отправлено» — дедуп крона
-- (infrastructure/jobs/lifecycle-emails.ts). Сбрасывается в NULL при продлении периода
-- (features/subscription/apply-payment.ts), как renewal_reminder_sent_at.
-- Идемпотентно (см. остальные миграции, дрейф dev/test).
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "inactivity_reminder_sent_at" TIMESTAMP(3);

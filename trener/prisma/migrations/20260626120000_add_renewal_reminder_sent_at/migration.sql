-- Отметка «напоминание о скором конце периода уже отправлено» — дедуп крона напоминаний.
-- NULL = ещё не напоминали; сбрасывается в NULL при продлении (новый оплаченный период).
-- Идемпотентно (в dev накатывается вручную из-за дрейфа migrate-истории, см. retrospectives).
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "renewal_reminder_sent_at" TIMESTAMP(3);

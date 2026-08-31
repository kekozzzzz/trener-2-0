-- Метки «письмо уже отправлено» — дедуп двух lifecycle-писем (infrastructure/jobs/lifecycle-emails.ts).
-- Не влияют на тарифы/лимиты — только чтобы крон не слал письмо повторно.
-- NULL = ещё не отправлено. Идемпотентно (см. остальные миграции, дрейф dev/test).
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "win_back_email_sent_at" TIMESTAMP(3);
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "engagement_nudge_sent_at" TIMESTAMP(3);

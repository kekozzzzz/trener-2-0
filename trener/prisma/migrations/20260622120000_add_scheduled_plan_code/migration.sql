-- Запланированная смена тарифа со следующего периода (даунгрейд).
-- Хранит код тарифа, на который перейти при ближайшем автопродлении; NULL = без смены.
-- Идемпотентно (в dev накатывалось вручную из-за дрейфа migrate-истории, см. retrospectives).
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "scheduled_plan_code" TEXT;

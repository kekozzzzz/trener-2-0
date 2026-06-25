-- Сводный текст-характеристика игры по всем турнирам (показ в личном кабинете).
-- Числа в тексте считает парсер, LLM только формулирует (правило 1). Nullable.
-- Идемпотентно (в dev накатывается вручную из-за дрейфа migrate-истории).
ALTER TABLE "player_profiles" ADD COLUMN IF NOT EXISTS "characteristic" TEXT;

-- Покерный ник игрока для показа в разборах (вместо «Hero»). Nullable, в LLM не идёт.
-- Идемпотентно (в dev накатывалось вручную из-за дрейфа migrate-истории).
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "nickname" TEXT;

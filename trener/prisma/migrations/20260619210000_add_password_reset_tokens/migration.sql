-- Одноразовые токены сброса пароля. Сырой токен — только в ссылке из письма; в базе
-- хранится SHA-256 (token_hash). Применяется к dev и test вручную (db execute) из-за
-- давнего drift; IF NOT EXISTS — для идемпотентности. Партиальные индексы из вывода
-- `migrate diff` сюда НЕ включены (они уже существуют как WHERE-индексы, см. журнал).

-- CreateTable
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "password_reset_tokens_player_id_idx" ON "password_reset_tokens"("player_id");

-- AddForeignKey (без IF NOT EXISTS — у ADD CONSTRAINT его нет; повторный запуск не нужен,
-- таблица создаётся этой же миграцией). Guard через DO-блок на случай повторного прогона.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'password_reset_tokens_player_id_fkey'
  ) THEN
    ALTER TABLE "password_reset_tokens"
      ADD CONSTRAINT "password_reset_tokens_player_id_fkey"
      FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

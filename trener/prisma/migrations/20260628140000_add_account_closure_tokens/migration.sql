-- Одноразовые токены закрытия аккаунта по ссылке. Сырой токен — только в письме; в
-- базе SHA-256 (token_hash). Закрытие подтверждается кнопкой на странице (не по клику),
-- доступ к ящику = подтверждение владельца. Применяется к dev и test вручную
-- (db execute) из-за давнего drift; IF NOT EXISTS — для идемпотентности.

-- CreateTable
CREATE TABLE IF NOT EXISTS "account_closure_tokens" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_closure_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "account_closure_tokens_token_hash_key" ON "account_closure_tokens"("token_hash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "account_closure_tokens_player_id_idx" ON "account_closure_tokens"("player_id");

-- AddForeignKey (guard через DO-блок: у ADD CONSTRAINT нет IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_closure_tokens_player_id_fkey'
  ) THEN
    ALTER TABLE "account_closure_tokens"
      ADD CONSTRAINT "account_closure_tokens_player_id_fkey"
      FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

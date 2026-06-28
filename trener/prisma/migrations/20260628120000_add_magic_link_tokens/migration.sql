-- Одноразовые токены входа по «волшебной ссылке» (passwordless: вход + регистрация).
-- Сырой токен — только в ссылке из письма; в базе хранится SHA-256 (token_hash).
-- Ключ — email (а не player_id): при первой регистрации игрока ещё нет, FK невозможен.
-- Применяется к dev и test вручную (db execute) из-за давнего drift; IF NOT EXISTS —
-- для идемпотентности.

-- CreateTable
CREATE TABLE IF NOT EXISTS "magic_link_tokens" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "magic_link_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "magic_link_tokens_token_hash_key" ON "magic_link_tokens"("token_hash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "magic_link_tokens_email_idx" ON "magic_link_tokens"("email");

-- Учёт расходов LLM по игрокам (plans/2026-06-21-учёт-расходов-llm.md).
-- Аддитивно: новая таблица + индексы + FK на players. Существующее не трогает.

CREATE TABLE "llm_usage" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "step" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER NOT NULL,
    "output_tokens" INTEGER NOT NULL,
    "cache_write_tokens" INTEGER NOT NULL,
    "cache_read_tokens" INTEGER NOT NULL,
    "cost_usd" DECIMAL(10,6) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_usage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_llm_usage_player" ON "llm_usage"("player_id");

CREATE INDEX "idx_llm_usage_created" ON "llm_usage"("created_at");

ALTER TABLE "llm_usage" ADD CONSTRAINT "llm_usage_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

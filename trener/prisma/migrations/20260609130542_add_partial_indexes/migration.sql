-- Partial indexes — WHERE условия, которые Prisma DSL не поддерживает напрямую.
-- Заменяем обычные индексы (созданные в миграции _init) на частичные:
-- мягко удалённые записи не попадают в индекс → меньше шума в горячих запросах.
-- Источник: architecture/03-база-данных.md, раздел 2 «Частые запросы и индексы».

-- ── tournaments: фоновый разборщик ищет только не удалённые ──────────────────
DROP INDEX IF EXISTS "idx_tournaments_pending_parse";
CREATE INDEX "idx_tournaments_pending_parse"
  ON "tournaments" ("status", "created_at")
  WHERE "deleted_at" IS NULL;

-- ── tournaments: список турниров игрока (только не удалённые) ─────────────────
DROP INDEX IF EXISTS "idx_tournaments_player_timeline";
CREATE INDEX "idx_tournaments_player_timeline"
  ON "tournaments" ("player_id", "played_at")
  WHERE "deleted_at" IS NULL;

-- ── tournaments: проверка месячного лимита (только не удалённые) ─────────────
DROP INDEX IF EXISTS "idx_tournaments_player_monthly_count";
CREATE INDEX "idx_tournaments_player_monthly_count"
  ON "tournaments" ("player_id", "created_at")
  WHERE "deleted_at" IS NULL;

-- ── hh_files: кандидаты на чистку — только те, что ещё не почищены ───────────
DROP INDEX IF EXISTS "idx_hh_files_purge_candidates";
CREATE INDEX "idx_hh_files_purge_candidates"
  ON "hh_files" ("purged_at")
  WHERE "purged_at" IS NULL;

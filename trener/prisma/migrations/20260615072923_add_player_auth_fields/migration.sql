-- AlterTable
ALTER TABLE "players" ADD COLUMN     "terms_accepted_at" TIMESTAMP(3);

-- Индексы idx_hh_files_purge_candidates, idx_tournaments_* уже существуют как
-- частичные индексы (WHERE ...), созданные вручную в миграции
-- 20260609130542_add_partial_indexes. Prisma DSL не знает про partial-индексы
-- и каждый раз генерирует их повторно как обычные — отбрасываем эту часть,
-- иначе CREATE INDEX падает с "уже существует".

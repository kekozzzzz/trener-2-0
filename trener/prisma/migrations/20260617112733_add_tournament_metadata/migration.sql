-- Метаданные турнира из заголовка HH-файла: площадка, название, номер турнира.
-- Номер турнира (external_tournament_id) — ключ дедупликации повторной загрузки.
ALTER TABLE "tournaments" ADD COLUMN     "external_tournament_id" TEXT,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "room" TEXT;

-- Индекс под поиск дубля при загрузке (тот же игрок + площадка + номер турнира),
-- партиальный по неудалённым — в одном стиле с остальными индексами tournaments
-- (architecture/03-база-данных.md; Prisma DSL не выражает partial, поэтому WHERE задаём здесь вручную).
CREATE INDEX "idx_tournaments_dedup" ON "tournaments"("player_id", "room", "external_tournament_id") WHERE "deleted_at" IS NULL;

-- Учёт присланных файлов нераспознанного формата (образцы новых румов). Сам файл
-- кладётся в приватное S3 (storage_key), если хранилище настроено; авто-удаляется
-- через 90 дней по lifecycle бакета. Эта запись — лог: какой формат пришёл, чтобы
-- потом написать парсер. Бинарь/нечитаемое в S3 не кладём (storage_key = NULL).
-- IF NOT EXISTS — идемпотентность (давний drift dev/test, как у прочих миграций).

-- CreateTable
CREATE TABLE IF NOT EXISTS "unrecognized_uploads" (
    "id" UUID NOT NULL,
    "player_id" UUID,
    "signature" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "storage_key" TEXT,
    "original_filename" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "unrecognized_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_unrecognized_uploads_recent" ON "unrecognized_uploads"("created_at");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_unrecognized_uploads_sha" ON "unrecognized_uploads"("sha256");

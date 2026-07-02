-- Журнал событий входа (auth_events): регистрация / вход по паролю / вход по
-- волшебной ссылке / неудачная попытка. Хранится только ISO-код страны по IP,
-- сам IP-адрес не сохраняется (минимизация ПДн). plans/2026-07-02-админ-статистика.md
--
-- Примечание: prisma сгенерировал сюда также пересоздание индексов tournaments/hh_files
-- (drift от ручных partial-индексов старых миграций) — эти строки удалены вручную:
-- индексы уже существуют, а их partial-форма (WHERE deleted_at IS NULL) сознательная.

-- CreateEnum
CREATE TYPE "AuthEventKind" AS ENUM ('REGISTER', 'LOGIN_PASSWORD', 'LOGIN_MAGIC', 'LOGIN_FAILED');

-- AlterTable: выравнивание точности viewed_at до канонической TIMESTAMP(3)
-- (ручная миграция 20260629120000 создала колонку без (3))
ALTER TABLE "hands" ALTER COLUMN "viewed_at" SET DATA TYPE TIMESTAMP(3);

-- CreateTable
CREATE TABLE "auth_events" (
    "id" UUID NOT NULL,
    "player_id" UUID,
    "kind" "AuthEventKind" NOT NULL,
    "country" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_auth_events_recent" ON "auth_events"("created_at");

-- CreateIndex
CREATE INDEX "idx_auth_events_kind" ON "auth_events"("kind", "created_at");

-- AddForeignKey
ALTER TABLE "auth_events" ADD CONSTRAINT "auth_events_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;

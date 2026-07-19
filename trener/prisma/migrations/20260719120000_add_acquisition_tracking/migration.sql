-- Источники переходов (GipsyTeam, Telegram, ...): plans/2026-07-19-источники-переходов.md
-- utm_source на регистрации (по образцу country) + журнал заходов по /go/<source>.

-- AlterTable
ALTER TABLE "auth_events" ADD COLUMN "utm_source" TEXT;

-- CreateTable
CREATE TABLE "landing_visits" (
    "id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "landing_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_landing_visits_source" ON "landing_visits"("source", "created_at");

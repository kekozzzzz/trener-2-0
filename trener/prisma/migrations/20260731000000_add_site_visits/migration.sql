-- Общий счётчик заходов на сайт (не только через меченые /go-ссылки).
-- CreateTable
CREATE TABLE "site_visits" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_visits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_site_visits_created_at" ON "site_visits"("created_at");

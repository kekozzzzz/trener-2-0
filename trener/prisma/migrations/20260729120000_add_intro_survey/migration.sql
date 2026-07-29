-- Опрос «мы только в начале пути» после первого турнира игрока.
-- Аддитивно: новая колонка на players + новая таблица + индексы + FK. Существующее не трогает.
-- plans/2026-07-29-опрос-после-первого-турнира.md

-- AlterTable: флаг «опрос уже показывали» (показ или отправка ответа) — Player, не сам опрос.
ALTER TABLE "players" ADD COLUMN "intro_survey_shown_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "intro_survey_responses" (
    "id" UUID NOT NULL,
    "player_id" UUID NOT NULL,
    "tournament_id" UUID NOT NULL,
    "usefulness_rating" INTEGER NOT NULL,
    "unclear_text" TEXT,
    "tone_rating" INTEGER NOT NULL,
    "style_change_text" TEXT,
    "questions_rating" INTEGER NOT NULL,
    "more_detail_text" TEXT,
    "liked_text" TEXT,
    "missing_text" TEXT,
    "recommend_rating" INTEGER NOT NULL,
    "freeform_text" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "intro_survey_responses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_intro_survey_player" ON "intro_survey_responses"("player_id");

-- CreateIndex
CREATE INDEX "idx_intro_survey_tournament" ON "intro_survey_responses"("tournament_id");

-- AddForeignKey
ALTER TABLE "intro_survey_responses" ADD CONSTRAINT "intro_survey_responses_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intro_survey_responses" ADD CONSTRAINT "intro_survey_responses_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "tournaments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

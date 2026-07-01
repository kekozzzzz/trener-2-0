-- Момент раздачи из HH — для порядка «до текущей» при профиле оппонента
-- (parser/opponent-profile). Только ДОБАВЛЯЕТ колонку и индекс, ничего не удаляет.
ALTER TABLE "hands" ADD COLUMN "played_at" TIMESTAMP(3);

CREATE INDEX "idx_hands_tournament_played" ON "hands"("tournament_id", "played_at");

-- AlterTable: analysis заполняется LLM только для раздач, попавших в карточку;
-- остальные ~60 раздач турнира хранятся без разбора (про запас для будущей «Тренировки»)
ALTER TABLE "hands" ALTER COLUMN "analysis" DROP NOT NULL;
ALTER TABLE "hands" ADD COLUMN "selected_for_card" BOOLEAN NOT NULL DEFAULT false;

-- RedefineIndex: карточка турнира грузит раздачи по selected_for_card, не по importance_level
DROP INDEX "idx_hands_tournament_card";
CREATE INDEX "idx_hands_tournament_card" ON "hands"("tournament_id", "selected_for_card");

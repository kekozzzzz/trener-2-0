-- Многораундовый сократовский диалог (architecture/02-сущности.md, решение 2026-06-11;
-- открытый вопрос закрыт 2026-06-13, см. plans/2026-06-13-dialog-multiround.md).
--
-- dialogues теряет question/answer (переносятся в dialogue_rounds как раунд №1),
-- остаются verdict + state (теперь описывают текущий открытый раунд).

-- CreateTable
CREATE TABLE "dialogue_rounds" (
    "id" UUID NOT NULL,
    "dialogue_id" UUID NOT NULL,
    "round_number" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dialogue_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dialogue_rounds_dialogue_id_round_number_key" ON "dialogue_rounds"("dialogue_id", "round_number");

-- AddForeignKey
ALTER TABLE "dialogue_rounds" ADD CONSTRAINT "dialogue_rounds_dialogue_id_fkey" FOREIGN KEY ("dialogue_id") REFERENCES "dialogues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Перенос существующих диалогов: question/answer становятся раундом №1
INSERT INTO "dialogue_rounds" ("id", "dialogue_id", "round_number", "question", "answer", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", 1, "question", "answer", "created_at", "updated_at" FROM "dialogues";

-- AlterTable
ALTER TABLE "dialogues" DROP COLUMN "question";
ALTER TABLE "dialogues" DROP COLUMN "answer";

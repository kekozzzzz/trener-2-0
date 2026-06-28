-- Память тренера: отпечаток спота раздачи (parser/spot-fingerprint).
-- Считает ПАРСЕР детерминированно (Правило 1) — позиция/роль/глубина/борд/попадание.
-- spot — структурный отпечаток (для градуированной похожести), spot_key — канонический
-- ключ для быстрого поиска похожих спотов игрока. Обе колонки nullable: старые раздачи
-- остаются с NULL (бэкафилл — отдельно), новые получают отпечаток при разборе.
ALTER TABLE "hands" ADD COLUMN "spot" JSONB;
ALTER TABLE "hands" ADD COLUMN "spot_key" TEXT;

CREATE INDEX "idx_hands_spot_key" ON "hands"("spot_key");

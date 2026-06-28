-- Приоритет задач очереди: живое/интерактивное (вопрос диалога, вердикт, чат) идёт
-- вперёд массового разбора, чтобы залив пачки турниров не замораживал чужие живые
-- диалоги. Больше = раньше; по умолчанию 0 (массовый разбор).
ALTER TABLE "tasks" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 0;

-- Пересобираем горячий индекс очереди с учётом приоритета: воркер берёт PENDING с
-- run_after <= NOW(), по приоритету (убыв.), внутри приоритета — по created_at.
DROP INDEX IF EXISTS "idx_tasks_queue";
CREATE INDEX "idx_tasks_queue" ON "tasks" ("status", "run_after", "priority", "created_at");

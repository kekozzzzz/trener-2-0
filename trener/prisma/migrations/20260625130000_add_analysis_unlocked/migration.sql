-- Флаг «разбор открыт/заперт» у турнира. Метрики парсера видны всегда;
-- этот флаг гейтит только платную ИИ-часть (разбор раздач, диалоги, обзор).
-- default true: обычный поток и выключенный гейт не меняются; заперт = false.
ALTER TABLE "tournaments" ADD COLUMN IF NOT EXISTS "analysis_unlocked" BOOLEAN NOT NULL DEFAULT true;

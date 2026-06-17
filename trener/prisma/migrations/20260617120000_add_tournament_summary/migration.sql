-- Обзор турнира («общая картина»): обзорный абзац + ключевые моменты со ссылками
-- на раздачи. Заполняет шаг GENERATE_TOURNAMENT_SUMMARY (plans/2026-06-17-обзор-турнира.md).
-- Структура JSON: { "overview": "...", "moments": [{ "handId": "...", "label": "..." }] }.
ALTER TABLE "tournaments" ADD COLUMN "summary" JSONB;

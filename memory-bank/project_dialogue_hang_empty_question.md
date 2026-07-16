---
name: project_dialogue_hang_empty_question
description: "Баг 2026-07-15: пустой вопрос диалога (санитайзер вычистил весь текст) → раунд-пустышка {{table:N}} → разбор зависал; фикс: пустой вопрос → complete (вердикт); + КАК руками разблокировать зависший диалог в прод-БД"
metadata: 
  node_type: memory
  type: project
  originSessionId: 40d6574c-1354-4333-8b3b-657ef0f37157
---

**Баг (инцидент 2026-07-15, раздача AJo на 144-KO).** Игрок ответил на вопрос диалога, дальше показалось «Вопрос N» с пустым полем и без вердикта — разбор завис. Причина: `generateNextQuestion` вернул вопрос, который санитайзер `cleanCoachText` вычистил В ПУСТОТУ (весь текст срезан, либо модель прислала «»). `validateNextQuestion` (parse.ts) проверял только `typeof question === "string"`, НЕ пустоту → пустой вопрос проходил. Шаг `generate-dialogue-question.ts` оборачивал его `applyTableMarker` → раунд с `question = "{{table:N}}"` (только токен таблицы, 13 симв., без текста). Ответить не на что, вердикт не наступает (диалог в состоянии QUESTION_ASKED навсегда). Задача при этом DONE — очередь чистая, поэтому по статусу задач НЕ виден.

**Фикс (parse.ts validateNextQuestion, коммит от 2026-07-15):** если `!complete` и вопрос после `cleanCoachText` пустой (trim === "") → возвращаем `complete: true` → диалог грациозно уходит в GENERATE_VERDICT вместо раунда-пустышки. +2 теста в parse.test.ts. Единое место — покрывает оба адаптера (openrouter + anthropic).

**⚠️ НЕ путать с [[feedback_no_deploy_during_analysis]]:** там зависание от ДЕПЛОЯ (рестарт процесса рвёт шаг в PROCESSING, жнец через 10 мин). Здесь — задача DONE, но контент пустой. Диагностика различает: смотри dialogue_rounds последнего раунда — пустой question (len<20, только `{{table:N}}`, answer IS NULL) = ЭТОТ баг; задача в PROCESSING/POISONED = деплойное.

**КАК руками разблокировать зависший диалог в прод-БД** (доступ к ВМ — см. [[project_tournament_delete]]):
1. Найти раздачу: `dialogues d JOIN hands h ... WHERE d.updated_at > now()-interval '3 hours' AND d.verdict IS NULL` — по heroCards/турниру опознать.
2. Глянуть раунды: `SELECT round_number, length(question) qlen, (answer IS NULL) FROM dialogue_rounds WHERE dialogue_id=(SELECT id FROM dialogues WHERE hand_id='<HID>') ORDER BY round_number;` — пустышка = последний раунд с qlen<20 и answer IS NULL.
3. Разблокировать (транзакция): DELETE пустого раунда (`round_number=N AND answer IS NULL AND length(question)<20` — надёжнее, чем сверять точный текст: `{{table:19}}` = 12-13 симв. с возможным хвостом); UPDATE dialogues SET state='ANSWER_RECEIVED' (было QUESTION_ASKED); INSERT task `GENERATE_VERDICT` payload `{"handId":"<HID>"}` (колонки tasks: id gen_random_uuid(), type, payload jsonb, status 'PENDING', attempt 0, priority 0, run_after/created_at/updated_at now()).
4. Воркер подхватит (~15с), вердикт сгенерится по отвеченным раундам, state → VERDICT_SHOWN. Игрок обновляет страницу → видит вердикт. Verdict step требует ANSWER_RECEIVED + verdict IS NULL + analysis.draftVerdict (есть) + метрики турнира (PARSED).

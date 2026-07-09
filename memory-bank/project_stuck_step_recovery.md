---
name: project-stuck-step-recovery
description: "вечная крутилка вылечена — интерактивные шаги (диалог/чат/парс) при POISONED показывают «не получилось, повторить» вместо бесконечного «готовим…»; в коде, ждёт выкатки"
metadata:
  node_type: memory
  type: project
---

**Проблема (аудит 2026-07-09):** если шаг, которого игрок ждёт в реальном времени, сдыхал в карантин (POISONED после 3 попыток) — диалог навсегда висел в `ANSWER_RECEIVED`, чат в `awaitingReply`, турнир в `UPLOADED`, а wait-клиенты крутили «готовим…» / «готовим ответ» / экран парсинга БЕЗ конца (нет капа). Само не разморозится. Массовый разбор раздач этим НЕ страдал — там карточка уже переживает POISONED (`generate-hand-analysis.ts markCardReadyIfComplete`).

**Решение (2026-07-09, в коде, НЕ задеплоено — ждёт «выкатывай»):**
- Модуль `features/queue-recovery/` — `queries.ts` (детекторы `isDialogueStepFailed/isChatReplyFailed/isTournamentParseFailed` + `requeuePoisonedTasks`, принимают db для тестов) + `actions.ts` (server actions `retryDialogueStep/retryChatReply/retryTournamentParse` с проверкой прав). Привязка задачи к сущности — по JSON-payload (`payload: { path:["handId"|"tournamentId"], equals }`, Prisma-фильтр, проверен на боевом Postgres).
- Статус-роуты (`/api/dialogue/[handId]`, `/api/chat/[handId]`, `/api/tournament/[id]/status`) отдают `failed: boolean` (считают ТОЛЬКО в состоянии ожидания — лишних запросов на опрос нет).
- 3 wait-клиента: на `failed` (или предохранитель ~5 мин — кап от вечного опроса) показывают «не получилось, повторить»; кнопка зовёт retry-action → сброс POISONED→PENDING (attempt=0) + пинок воркера → снова ждём. Шаги идемпотентны, повтор доделывает недостающее.
- Формулировки (по обзору UX-практик: вина «на нашей стороне», не на игроке; сразу действие) в `messages/{ru,en}.json` — `HandReview.stepFailed/retry/retrying`, `Chat.replyFailed/…`, `ParsingWait.failed/…`.
- Тест `__tests__/features/queue-recovery.test.ts` (6 кейсов, боевая trener_test).

Живую проверку клика «повторить» лучше сделать на сайте после выката (воспроизвести POISONED в дев-приложении дорого). Связано: [[project_queue_latency]] (тот же роунд устойчивости), [[project_trainer_spot_memory]].

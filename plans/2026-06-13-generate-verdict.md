# GENERATE_VERDICT: ответ игрока → вердикт сократовского диалога

**Дата:** 2026-06-13
**Статус:** готово

> Реализует шаг 4 из [[../architecture/04-потоки-данных]] раздел 2 (событие №4: «Ответ на сократовский вопрос») и задачу `GENERATE_VERDICT` из раздела 3.
> Продолжает [[2026-06-13-воркеры-карточки-llm-разбор]] — там `GENERATE_HAND_ANALYSIS` уже создаёт `Dialogue {question, state: QUESTION_ASKED}` для CRITICAL-раздач, `draftVerdict` лежит в `hands.analysis`.

---

## Открытый вопрос (решён перед планом)

`architecture/02-сущности.md` (решение 2026-06-11) и `architecture/00-правила-проекта.md` (правило 2) описывают Диалог как **многораундовый** (~5 раундов наводящих вопросов перед `evaluation`). Текущая схема `dialogues` (`architecture/03-база-данных.md`) — **однораундовая**: одно поле `question`, одно `answer`, одно `verdict`, состояния `QUESTION_ASKED → ANSWER_RECEIVED → VERDICT_SHOWN`. Многораундовость на этой схеме физически не выразить — потребовалась бы новая таблица/JSONB-массив раундов, то есть изменение схемы БД (требует согласия по CLAUDE.md).

**Решение Артёма:** реализовать `GENERATE_VERDICT` сейчас как **однораундовый**, под текущую схему — ровно так, как было размечено в прошлом плане («Не входит в эту фазу»: `draftVerdict` из `hands.analysis` → `dialogues.verdict`). Расхождение с решением 2026-06-11 фиксируется как открытый вопрос в журнале — многораундовость потребует отдельной задачи с миграцией схемы и отдельного согласования.

---

## Решения

### 1. Запись ответа игрока — `submitAnswer` (`features/dialogue/actions.ts`, новый модуль)

Лёгкая операция (раздел 2 п.4 [[../architecture/04-потоки-данных]]):

- Вход: `{ handId, answer }`.
- Читает `Dialogue` по `handId`.
  - Не найден → `{ ok: false, error: "DIALOGUE_NOT_FOUND" }`.
  - `state !== "QUESTION_ASKED"` → **идемпотентный возврат**: уже сохранённый диалог как есть, без записи и без повторной постановки `GENERATE_VERDICT` (раздел 2 п.4: «повторная отправка формы возвращает уже сохранённый ответ, не создаёт второй [переход]»).
  - `state === "QUESTION_ASKED"` и `answer` непустой → одной транзакцией: `answer = input.answer`, `state = "ANSWER_RECEIVED"`, `enqueue GENERATE_VERDICT {handId}`.
- Пустой/пробельный `answer` → `{ ok: false, error: "EMPTY_ANSWER" }`, без изменений.

### 2. LLM-порт: `generateVerdict` (`infrastructure/adapters/llm/{types,fake,anthropic}.ts`)

- `types.ts`: новый тип `VerdictRequest` — `{ question, answer, draftVerdict, tableSnapshot, chipResult, tournament: TournamentContext }` (тот же контекст, что и `HandAnalysisRequest`, плюс вопрос/ответ/черновик); `VerdictResult = { verdict: string }`; `LlmPort.generateVerdict(request): Promise<VerdictResult>`.
- `fake.ts`: детерминированный `generateVerdict` — собирает строку из `draftVerdict` и `answer`, без сети.
- `anthropic.ts`: реальный вызов через `config/prompts/verdict.ts`, валидация JSON (`verdict: string`), невалидный ответ → ошибка → обычный путь очереди.

### 3. Промпт `config/prompts/verdict.ts` (новый, продуктовый контент — черновик)

Системный промпт повторяет обязательные строки правила 1 (`не вычисляй метрики`, `если не уверен — уточняющий вопрос вместо категоричного совета»`) — вердикт это тоже стратегическое суждение (правило 1, последний абзац). Пользовательский промпт передаёт: контекст турнира, снимок раздачи, `draftVerdict` (черновик из `GENERATE_HAND_ANALYSIS`), заданный вопрос и ответ игрока. Просит финальный `verdict` — разбор, который учитывает, что ответил игрок (подтвердить его понимание, мягко поправить, если ответ показывает заблуждение).

### 4. Шаг очереди `GENERATE_VERDICT` (`infrastructure/queue/steps/generate-verdict.ts`, новый)

Payload `{handId}`, тяжёлая платная задача (раздел 2 п.4, п.9 [[../architecture/04-потоки-данных]]):

- Читает `Dialogue` + `Hand` (с `analysis.draftVerdict`) + `Tournament` по `handId`.
- Идемпотентность платного вызова (раздел 4 [[../architecture/04-потоки-данных]]): если `dialogue.verdict !== null` (или `state === "VERDICT_SHOWN"`) — пропускает вызов LLM, выходит без действий.
- **Защита правила 2 на уровне данных**: если `dialogue.state === "QUESTION_ASKED"` (ответа ещё нет) — это нарушение инварианта (задача не должна была быть поставлена); бросает ошибку → обычный путь очереди (retry → poison), вердикт не пишется.
- Иначе (`state === "ANSWER_RECEIVED"`): собирает `VerdictRequest` из `dialogue.question`, `dialogue.answer`, `hand.analysis.draftVerdict`, `hand.tableData`, `hand.chipResult`, метрик турнира → `llmAdapter.generateVerdict(...)`.
- Одной транзакцией: `dialogue.verdict = result.verdict`, `dialogue.state = "VERDICT_SHOWN"`.

### 5. Регистрация шага

`infrastructure/queue/bootstrap.ts`: `registerStep("GENERATE_VERDICT", generateVerdictStep)`.

### 6. Тесты

- `__tests__/features/dialogue/submit-answer.test.ts` (новый):
  - записывает ответ, переводит `QUESTION_ASKED → ANSWER_RECEIVED`, ставит `GENERATE_VERDICT {handId}`;
  - повторная отправка (уже `ANSWER_RECEIVED`) — не меняет `answer`, не создаёт вторую задачу `GENERATE_VERDICT`, возвращает текущий диалог;
  - пустой ответ — ошибка, без изменений;
  - диалог не найден — ошибка.
- `__tests__/queue/generate-verdict.test.ts` (новый, по образцу `generate-hand-analysis.test.ts`, fake-адаптер):
  - сохраняет `verdict`, переводит `ANSWER_RECEIVED → VERDICT_SHOWN`;
  - идемпотентность — повторный вызов после `VERDICT_SHOWN` не зовёт LLM повторно, `verdict` не меняется;
  - `state === "QUESTION_ASKED"` (ответа нет) — задача падает с понятной ошибкой, `verdict` остаётся `NULL`, `state` не меняется (проверка правила 2 на данных).
- `__tests__/acceptance/upload-tournament.test.ts` — дополнить существующий тест «карточка после полного цикла»: для одной из 2 CRITICAL-раздач вызвать `submitAnswer`, прогнать воркер ещё раз, проверить `dialogue.state === "VERDICT_SHOWN"` и `verdict` заполнен; вторая раздача остаётся `QUESTION_ASKED` (диалог по второй раздаче не трогаем — показывает, что переход специфичен для одной раздачи).

### 7. Журналы решений

- `architecture/04-потоки-данных.md` — запись о реализации `GENERATE_VERDICT` и `submitAnswer` (по аналогии с записью от 2026-06-13 про `GENERATE_HAND_ANALYSIS`).
- `architecture/02-сущности.md` — открытый вопрос: многораундовый диалог (решение 2026-06-11) требует новой схемы `dialogues`; на сегодня `GENERATE_VERDICT` реализован однораундово на текущей схеме, расширение — отдельная задача с миграцией и согласованием.
- `architecture/08-структура-кода.md` — новые файлы: `features/dialogue/actions.ts`, `infrastructure/queue/steps/generate-verdict.ts`, `config/prompts/verdict.ts`, расширение `infrastructure/adapters/llm/*`.

---

## Файлы

- `trener/features/dialogue/actions.ts` — новый, `submitAnswer`
- `trener/infrastructure/queue/steps/generate-verdict.ts` — новый
- `trener/infrastructure/queue/bootstrap.ts` — регистрация
- `trener/infrastructure/adapters/llm/types.ts`, `fake.ts`, `anthropic.ts` — `generateVerdict`
- `trener/config/prompts/verdict.ts` — новый
- Тесты: `__tests__/features/dialogue/submit-answer.test.ts`, `__tests__/queue/generate-verdict.test.ts`, обновление `__tests__/acceptance/upload-tournament.test.ts`
- `architecture/04-потоки-данных.md`, `architecture/02-сущности.md`, `architecture/08-структура-кода.md` — журналы решений

---

## Не входит в эту фазу

- Многораундовый диалог (~5 раундов) — отдельная задача, новая схема `dialogues`, требует согласия по CLAUDE.md
- `RECALC_PROFILE` после `CARD_READY`
- UI диалога (`getDialogue`, экран раздачи)
- Дневной потолок расходов / авто-стоп LLM

---

## Статус задач

- [x] `features/dialogue/actions.ts`: `submitAnswer` (идемпотентность перехода)
- [x] LLM-порт: `generateVerdict` (`types`, `fake`, `anthropic`)
- [x] Промпт `config/prompts/verdict.ts`
- [x] `infrastructure/queue/steps/generate-verdict.ts`
- [x] Регистрация шага в `bootstrap.ts`
- [x] Тесты (`submit-answer`, `generate-verdict`, обновление acceptance)
- [x] `npm test` + `tsc --noEmit`
- [x] Журналы решений (`04-потоки-данных.md`, `02-сущности.md`, `08-структура-кода.md`)

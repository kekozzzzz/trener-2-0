# Многораундовый сократовский диалог (~5 раундов перед итогом)

**Дата:** 2026-06-13
**Статус:** реализовано

> Реализует решение от 2026-06-11 ([[../architecture/02-сущности]], раздел «Журнал решений») и закрывает открытый вопрос, зафиксированный там же 2026-06-13: однораундовая схема `dialogues` (`QUESTION_ASKED → ANSWER_RECEIVED → VERDICT_SHOWN`, одна пара `question`/`answer`/`verdict`) не может выразить ~5 раундов наводящих вопросов.
> Основа — [[2026-06-13-generate-verdict]] (готово): `submitAnswer`, `GENERATE_VERDICT`, идемпотентность, `LlmPort.generateVerdict`. Эта задача расширяет тот же цикл на N раундов, не переписывая его с нуля.

---

## Что требует согласия (CLAUDE.md, «Спроси разрешения»)

1. **Изменение схемы БД (№2)** — новая таблица `dialogue_rounds`, поля `question`/`answer` уходят из `dialogues` в неё. Раздел 1 ниже.
2. **Новый/изменённый промпт в продакшне (№5)** — новый `config/prompts/dialogue-question.ts` и правки `config/prompts/verdict.ts` (история раундов вместо одной пары). Раздел 4 ниже. На проде UI диалога ещё не открыт игрокам ([[../architecture/08-структура-кода]], журнал 2026-06-13: «`getDialogue` и UI диалога — отдельная задача, ещё не сделана»), поэтому риск для живых пользователей сейчас нулевой — но формально это продуктовый промпт, фиксирую как пункт согласия.

Без согласия по обоим пунктам код не пишется — это план для обсуждения.

---

## 1. Схема БД

### Текущая (`architecture/03-база-данных.md`)

```sql
CREATE TABLE dialogues (
  id, hand_id UNIQUE, question TEXT, answer TEXT, verdict TEXT,
  state dialogue_state DEFAULT 'QUESTION_ASKED', created_at, updated_at
);
```

### Новая

Один диалог — N раундов «вопрос → ответ» (N = конфиг, по умолчанию 5), затем `verdict`. `dialogues` хранит итог и состояние текущего раунда; `dialogue_rounds` — сами раунды, по аналогии с тем, как `chat_messages` хранит много сообщений на раздачу ([[../architecture/02-сущности]], связь «Раздача → Сообщение чата»).

```sql
-- dialogues: убираем question/answer, оставляем verdict + state
ALTER TABLE dialogues DROP COLUMN question;
ALTER TABLE dialogues DROP COLUMN answer;

-- новая таблица раундов
CREATE TABLE dialogue_rounds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dialogue_id  UUID NOT NULL REFERENCES dialogues(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,        -- 1..N
  question     TEXT NOT NULL,
  answer       TEXT,                    -- NULL до ответа игрока на этот раунд
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dialogue_id, round_number)
);
```

`dialogue_state` enum не меняется (`QUESTION_ASKED`/`ANSWER_RECEIVED`/`VERDICT_SHOWN`) — теперь описывает состояние **текущего открытого раунда**, а не единственного. `VERDICT_SHOWN` достижим только после ответа на последний раунд — гарантия правила 2 не меняется, просто переход происходит N раз вместо одного.

### Перенос данных

На проде UI диалога не открыт игрокам — реальных строк `dialogues` с заполненными `question`/`answer` от живых пользователей ещё нет (только тестовые/сидовые). Предлагаю одношаговую миграцию с переносом того, что есть, в `dialogue_rounds` как раунд №1:

```sql
INSERT INTO dialogue_rounds (dialogue_id, round_number, question, answer, created_at, updated_at)
SELECT id, 1, question, answer, created_at, updated_at FROM dialogues;
```

Если хотите перестраховаться по правилу «удаление поля — в два захода» ([[../architecture/03-база-данных]], раздел 5) — могу сначала сделать шаг «код перестаёт писать/читать `question`/`answer`», а физическое удаление колонок — отдельной миграцией позже. По умолчанию предлагаю одношаговую, раз данных по сути нет.

### `prisma/schema.prisma`

```prisma
model Dialogue {
  id        String        @id @default(uuid()) @db.Uuid
  handId    String        @unique @map("hand_id") @db.Uuid
  verdict   String?       // финальный разбор — после ответа на ПОСЛЕДНИЙ раунд
  state     DialogueState @default(QUESTION_ASKED) // состояние текущего открытого раунда
  createdAt DateTime      @default(now()) @map("created_at")
  updatedAt DateTime      @updatedAt @map("updated_at")

  hand   Hand            @relation(fields: [handId], references: [id], onDelete: Cascade)
  rounds DialogueRound[]

  @@map("dialogues")
}

model DialogueRound {
  id          String   @id @default(uuid()) @db.Uuid
  dialogueId  String   @map("dialogue_id") @db.Uuid
  roundNumber Int      @map("round_number")
  question    String
  answer      String?
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  dialogue Dialogue @relation(fields: [dialogueId], references: [id], onDelete: Cascade)

  @@unique([dialogueId, roundNumber])
  @@map("dialogue_rounds")
}
```

Каскад удаления уже закрыт: `dialogue_rounds` удаляется вместе с `dialogues`, которая удаляется вместе с `hands` → турниром (правило «отдельного флага удаления нет» из [[../architecture/03-база-данных]] не нарушается).

---

## 2. Конфиг — глубина диалога (правило 3)

Новый файл `config/dialogue.ts`, по образцу `config/llm.ts`:

```ts
const DEFAULT_ROUNDS_PER_HAND = 5;

export function getDialogueRoundsPerHand(): number {
  const raw = process.env.DIALOGUE_ROUNDS_PER_HAND;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ROUNDS_PER_HAND;
}
```

Глубина одинакова на всех тарифах ([[../architecture/02-сущности]], решение 2026-06-11) — одна константа, не зависит от подписки. Фиксированное число раундов (не LLM решает «достаточно ли») — держит стоимость токенов предсказуемой, как и зафиксировано в журнале решений `00-правила-проекта.md`.

---

## 3. Цикл раундов — расширение `GENERATE_VERDICT`

Текущий цикл (из [[2026-06-13-generate-verdict]]):
```
GENERATE_HAND_ANALYSIS → Dialogue{question, state=QUESTION_ASKED}
submitAnswer            → ANSWER_RECEIVED, enqueue GENERATE_VERDICT
GENERATE_VERDICT         → verdict, VERDICT_SHOWN
```

Новый цикл — та же форма, повторяется N раз, развилка в `submitAnswer` по номеру раунда:

```
GENERATE_HAND_ANALYSIS → Dialogue{state=QUESTION_ASKED} + DialogueRound{1, question, answer=NULL}

submitAnswer(round k):
  записывает answer в DialogueRound{k}, ANSWER_RECEIVED
  если k < N  → enqueue GENERATE_DIALOGUE_QUESTION {handId}
  если k == N → enqueue GENERATE_VERDICT {handId}            (как сегодня)

GENERATE_DIALOGUE_QUESTION:
  идемпотентность: DialogueRound{k+1} уже существует → выход
  правило 2: DialogueRound{k}.answer === NULL → ошибка (инвариант)
  LLM.generateNextQuestion(history = rounds 1..k) → question
  создаёт DialogueRound{k+1, question, answer=NULL}, state=QUESTION_ASKED

GENERATE_VERDICT (без изменений в идемпотентности/правиле 2, меняется вход):
  идемпотентность: dialogue.verdict !== NULL → выход         (как сегодня)
  правило 2: DialogueRound{N}.answer === NULL → ошибка        (как сегодня, но на раунде N)
  LLM.generateVerdict(history = rounds 1..N, draftVerdict) → verdict
  dialogue.verdict = verdict, state = VERDICT_SHOWN           (как сегодня)
```

`submitAnswer` находит «открытый» раунд как `DialogueRound`, где `answer IS NULL` (ровно один, с максимальным `roundNumber`, при `dialogue.state === QUESTION_ASKED`) — гарантия перехода через `updateMany({where: {handId, state: "QUESTION_ASKED"}})` остаётся той же, что и сегодня (повторная отправка формы — идемпотентный возврат, без второй задачи).

---

## 4. LLM-порт и промпты

### `infrastructure/adapters/llm/types.ts`

```ts
export type DialogueRoundSummary = {
  roundNumber: number;
  question: string;
  answer: string;
};

// Запрос на следующий наводящий вопрос (раунды 1..N-1)
export type NextQuestionRequest = {
  history: DialogueRoundSummary[];  // все раунды, отвеченные на этот момент
  draftVerdict: string;             // ориентир из GENERATE_HAND_ANALYSIS — куда ведём игрока
  chipResult: number;
  tableSnapshot: TableSnapshot;
  tournament: TournamentContext;
};

export type NextQuestionResult = { question: string };

// VerdictRequest: было question+answer (один раунд) → стало history (все N раундов)
export type VerdictRequest = {
  history: DialogueRoundSummary[];
  draftVerdict: string;
  chipResult: number;
  tableSnapshot: TableSnapshot;
  tournament: TournamentContext;
};
```

`LlmPort` — новый метод `generateNextQuestion`, `generateVerdict` — обновлённая сигнатура (та же форма входа, что у `generateNextQuestion`, только итог другой).

### `config/prompts/dialogue-question.ts` (новый)

Системный промпт повторяет обязательные строки правила 1 («не вычисляй метрики», «если не уверен — уточняющий вопрос, а не категоричный совет» — относится и к тому, в какую сторону вести следующий вопрос). Пользовательский промпт: контекст турнира + снимок раздачи + `draftVerdict` (куда ведём) + вся история раундов до сих пор → просит один следующий наводящий вопрос, не раскрывающий вердикт.

### `config/prompts/verdict.ts` (правки)

`buildVerdictPrompt` — вместо «Вопрос: «…» Ответ: «…»» рендерит всю историю раундов (`history`) по порядку: `Раунд k — вопрос: «…», ответ: «…»`. Системный промпт и обязательные строки правила 1 — без изменений.

### `infrastructure/adapters/llm/fake.ts` / `anthropic.ts`

- `fake.generateNextQuestion` — детерминированный текст с номером следующего раунда, без сети.
- `fake.generateVerdict` — собирает строку из `draftVerdict` + ответов всех раундов `history`.
- `anthropic.ts` — `generateNextQuestion` через новый промпт, валидация `{question: string}`; `generateVerdict` — тот же `callClaude`/`extractJson`, новый рендер истории в `buildVerdictPrompt`.

---

## 5. Очередь

- Новый шаг `infrastructure/queue/steps/generate-dialogue-question.ts` → `generateDialogueQuestionStep`, по образцу `generate-verdict.ts` (идемпотентность, проверка правила 2, та же форма транзакции).
- `infrastructure/queue/steps/generate-verdict.ts` — обновить чтение `dialogue.rounds` (вместо `dialogue.question`/`dialogue.answer`), собрать `history` для `VerdictRequest`, добавить проверку «это раунд N» (если последний раунд < N — задача поставлена не туда, инвариант нарушен → ошибка, путь карантина).
- `infrastructure/queue/steps/generate-hand-analysis.ts` — создание `Dialogue` для CRITICAL теперь со вложенным `rounds: { create: { roundNumber: 1, question: result.question } }` вместо поля `question` на самом `Dialogue`.
- `infrastructure/queue/bootstrap.ts` — `registerStep("GENERATE_DIALOGUE_QUESTION", generateDialogueQuestionStep)`.

`features/dialogue/actions.ts` (`submitAnswer`) — описано в разделе 3: ищет открытый раунд, пишет `answer`, переводит `ANSWER_RECEIVED`, ставит `GENERATE_DIALOGUE_QUESTION` или `GENERATE_VERDICT` по номеру раунда vs `getDialogueRoundsPerHand()`.

---

## 6. Тесты

- `__tests__/features/dialogue/submit-answer.test.ts` — переписать под раунды: ответ на раунд `k < N` ставит `GENERATE_DIALOGUE_QUESTION`, на раунд `N` — `GENERATE_VERDICT`; повторная отправка — идемпотентна как сегодня; пустой ответ / диалог не найден — без изменений в поведении.
- `__tests__/queue/generate-verdict.test.ts` — обновить фикстуры: `dialogue_rounds` вместо `question`/`answer` на `dialogues`; добавить кейс «последний раунд < N → ошибка инварианта».
- `__tests__/queue/generate-dialogue-question.test.ts` (новый) — по образцу `generate-verdict.test.ts`: создаёт раунд k+1, переводит в `QUESTION_ASKED`; идемпотентность (повторный вызов не дублирует раунд); правило 2 (`answer === NULL` на текущем раунде → ошибка).
- `__tests__/acceptance/upload-tournament.test.ts` — расширить цикл «карточка → диалог»: пройти все `N` раундов через `submitAnswer` + прогон воркера, проверить, что `dialogue.verdict` появляется только после раунда `N`, а промежуточные раунды создают новые `DialogueRound` с вопросом и `state=QUESTION_ASKED`.

---

## 7. Журналы решений (по завершении)

- `architecture/02-сущности.md` — закрыть открытый вопрос от 2026-06-13: многораундовый диалог реализован, `dialogues` хранит `verdict`+`state`, раунды — в `dialogue_rounds`.
- `architecture/03-база-данных.md` — новая таблица `dialogue_rounds`, миграция, запись в журнале решений.
- `architecture/04-потоки-данных.md` — новая задача очереди `GENERATE_DIALOGUE_QUESTION`, обновлённый цикл события №4.
- `architecture/08-структура-кода.md` — новые файлы: `config/dialogue.ts`, `config/prompts/dialogue-question.ts`, `infrastructure/queue/steps/generate-dialogue-question.ts`, правки `domain`/`features/dialogue`.

---

## Файлы

- `trener/prisma/schema.prisma` — `Dialogue` (убрать `question`/`answer`), новая модель `DialogueRound`
- `trener/prisma/migrations/<new>/migration.sql` — новая миграция
- `trener/config/dialogue.ts` — новый, `getDialogueRoundsPerHand`
- `trener/config/prompts/dialogue-question.ts` — новый
- `trener/config/prompts/verdict.ts` — рендер истории раундов
- `trener/infrastructure/adapters/llm/{types,fake,anthropic}.ts` — `generateNextQuestion`, обновлённый `VerdictRequest`/`generateVerdict`
- `trener/infrastructure/queue/steps/generate-dialogue-question.ts` — новый
- `trener/infrastructure/queue/steps/generate-verdict.ts` — обновить вход
- `trener/infrastructure/queue/steps/generate-hand-analysis.ts` — создание `Dialogue` с вложенным первым раундом
- `trener/infrastructure/queue/bootstrap.ts` — регистрация нового шага
- `trener/features/dialogue/actions.ts` — `submitAnswer` по раундам
- Тесты: `__tests__/features/dialogue/submit-answer.test.ts`, `__tests__/queue/generate-verdict.test.ts`, `__tests__/queue/generate-dialogue-question.test.ts` (новый), `__tests__/acceptance/upload-tournament.test.ts`
- Журналы: `architecture/02-сущности.md`, `architecture/03-база-данных.md`, `architecture/04-потоки-данных.md`, `architecture/08-структура-кода.md`

---

## Не входит в эту фазу

- `getDialogue` и UI экрана диалога (показ вопросов/ответов по раундам) — отдельная задача
- LLM-решение «достаточно ли раундов» (динамическая глубина) — сейчас глубина фиксирована конфигом, одинакова для всех раздач и тарифов
- Двухшаговое удаление колонок `question`/`answer` (раздел 1) — если потребуется перестраховка вместо одношаговой миграции

---

## Статус задач

- [x] Согласие на изменение схемы БД (раздел 1)
- [x] Согласие на новый/изменённый промпт (раздел 4)
- [x] `prisma/schema.prisma` + миграция (`dialogue_rounds`, перенос данных, удаление `question`/`answer`)
- [x] `config/dialogue.ts`
- [x] LLM-порт: `generateNextQuestion`, обновлённый `generateVerdict` (`types`, `fake`, `anthropic`)
- [x] `config/prompts/dialogue-question.ts`, правки `config/prompts/verdict.ts`
- [x] `infrastructure/queue/steps/generate-dialogue-question.ts` + регистрация в `bootstrap.ts`
- [x] `infrastructure/queue/steps/generate-verdict.ts` — обновить вход на `history`
- [x] `infrastructure/queue/steps/generate-hand-analysis.ts` — вложенный первый раунд
- [x] `features/dialogue/actions.ts` — `submitAnswer` по раундам
- [x] Тесты (новые + обновлённые)
- [x] `npm test` + `tsc --noEmit` + `next build`
- [x] Журналы решений (раздел 7)

## Итог

Реализовано полностью, как описано в плане, включая раздел 6 (приёмочный тест прогоняет полный цикл из N=3 раундов: каждый ответ < N открывает новый `DialogueRound` и возвращает `QUESTION_ASKED`, ответ на раунд N даёт `verdict` и `VERDICT_SHOWN`). `npm test` — 54/54 зелёных, `tsc --noEmit` и `next build` без ошибок, `prisma db seed` применён к `trener_dev`. Журналы решений обновлены в `02-сущности.md`, `03-база-данных.md`, `04-потоки-данных.md`, `08-структура-кода.md`. Открытый вопрос от 2026-06-13 закрыт.

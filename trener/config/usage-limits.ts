// Часовые лимиты на действия, которые тянут за собой платные вызовы Claude —
// защита кошелька от шторма (architecture/07-безопасность.md, раздел 2: «не
// больше N файлов в час», «лимит сообщений в час»). Это бизнес-числа, поэтому
// живут только в конфиге/.env (правило проекта №3), а не в коде логики.
//
// Зачем: один залогиненный аккаунт, дёргающий загрузку или чат в цикле, способен
// сжечь весь баланс Anthropic ($20, auto-reload выключен) задолго до того, как
// сработает месячный потолок воркспейса. Лимит на игрока в час режет такой цикл,
// не мешая живому человеку (пороги заведомо выше реального ручного темпа).
//
// Загрузка турнира при ленивом разборе — дешёвое действие: только парсинг и метрики,
// ИИ-разбор запускается отдельно по клику (и упирается в лимит тарифа). Поэтому часовой
// потолок загрузок щедрый — он лишь анти-бот, а не продуктовый лимит; «закид» считается
// по пачке (один клик = одна единица), так что выложить месяц за раз не мешает.

const DEFAULT_UPLOAD_MAX_PER_HOUR = 60;
const DEFAULT_UPLOAD_WINDOW_MS = 60 * 60 * 1000; // 1 час
// Сколько файлов можно закинуть за одну загрузку (пачкой). Часовой лимит выше
// считает «закиды» (один клик = одна единица), а этот потолок ограничивает размер
// самого закида. Парсинг лёгкий (~3 мс/файл), потолок выбран с большим запасом по
// скорости запроса; число — бизнес-настройка, живёт в конфиге (правило проекта №3).
const DEFAULT_UPLOAD_MAX_FILES_PER_BATCH = 100;
const DEFAULT_LLM_MESSAGE_MAX_PER_HOUR = 120;
const DEFAULT_LLM_MESSAGE_WINDOW_MS = 60 * 60 * 1000; // 1 час
// Распознавание речи дешевле вызова Claude, но тоже платное и зовётся напрямую
// эндпоинтом — режем шторм надиктовок. Потолок выше, чем у сообщений: одна реплика
// может состоять из нескольких надиктованных кусков.
const DEFAULT_TRANSCRIBE_MAX_PER_HOUR = 200;
const DEFAULT_TRANSCRIBE_WINDOW_MS = 60 * 60 * 1000; // 1 час

function intFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Сколько турниров один игрок может загрузить за окно.
export function getUploadMaxPerHour(): number {
  return intFromEnv(process.env.USAGE_UPLOAD_MAX_PER_HOUR, DEFAULT_UPLOAD_MAX_PER_HOUR);
}

export function getUploadWindowMs(): number {
  return intFromEnv(process.env.USAGE_UPLOAD_WINDOW_MS, DEFAULT_UPLOAD_WINDOW_MS);
}

// Потолок файлов в одной пакетной загрузке. Лишнее сверх потолка отсекается, в
// сводке помечается «capped».
export function getUploadMaxFilesPerBatch(): number {
  return intFromEnv(process.env.USAGE_UPLOAD_MAX_FILES_PER_BATCH, DEFAULT_UPLOAD_MAX_FILES_PER_BATCH);
}

// Сколько сообщений к LLM (ответы в сократовском диалоге + чат по раздаче, общий
// счётчик) один игрок может отправить за окно. Каждое = один вызов Claude.
export function getLlmMessageMaxPerHour(): number {
  return intFromEnv(process.env.USAGE_LLM_MESSAGE_MAX_PER_HOUR, DEFAULT_LLM_MESSAGE_MAX_PER_HOUR);
}

export function getLlmMessageWindowMs(): number {
  return intFromEnv(process.env.USAGE_LLM_MESSAGE_WINDOW_MS, DEFAULT_LLM_MESSAGE_WINDOW_MS);
}

// Сколько надиктовок (запросов к /api/stt) один игрок может сделать за окно.
export function getTranscribeMaxPerHour(): number {
  return intFromEnv(process.env.USAGE_TRANSCRIBE_MAX_PER_HOUR, DEFAULT_TRANSCRIBE_MAX_PER_HOUR);
}

export function getTranscribeWindowMs(): number {
  return intFromEnv(process.env.USAGE_TRANSCRIBE_WINDOW_MS, DEFAULT_TRANSCRIBE_WINDOW_MS);
}

// Лимитер считает в памяти процесса. В тестах (vitest) выключен по той же причине,
// что и лимитер аутентификации (см. config/auth.ts): весь прогон делит один
// процесс, сквозной счётчик перелился бы между несвязанными кейсами. Чистое ядро
// consumeQuota (features/usage/limit.ts) от флага не зависит и тестируется напрямую.
export function isUsageLimitEnabled(): boolean {
  return process.env.NODE_ENV !== "test" && !process.env.VITEST;
}

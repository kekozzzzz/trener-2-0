// Конфигурация служебного бота-сторожа (Telegram) — токен, адрес администратора и
// параметры релея живут только здесь и в .env (правило проекта №3, секреты в коде
// запрещены). Бизнес-логика и адаптер их не хардкодят.
//
// Сетевая особенность (см. architecture/06-внешние-сервисы.md, раздел 2.2 и
// project_llm_connectivity_block): прод-VM в РФ до api.telegram.org напрямую не
// достаёт — сообщения идут через тот же HTTPS-релей в Казахстане, что и Claude.
// Поэтому базовый адрес настраиваемый: на проде = релей, в деве/тестах пусто.

import nodePath from "path";

// Токен бота от @BotFather. Пусто — бот не настроен, уведомления молча отключены.
export function getTelegramBotToken(): string {
  return process.env.TELEGRAM_BOT_TOKEN ?? "";
}

// chat_id администратора (куда слать). Пусто — бот не настроен.
export function getTelegramAdminChatId(): string {
  return process.env.TELEGRAM_ADMIN_CHAT_ID ?? "";
}

// Базовый адрес Telegram Bot API. На проде — наш релей (например
// https://92.60.75.87/tg), который пересылает запрос на api.telegram.org с
// не-российского IP. Пусто — ходим на api.telegram.org напрямую (дев вне РФ).
// Доверие к самоподписанному серту релея уже задано процессу через
// NODE_EXTRA_CA_CERTS (тот же, что для Claude) — обычный fetch его подхватит.
export function getTelegramBaseUrl(): string {
  return (process.env.TELEGRAM_BASE_URL ?? "").replace(/\/$/, "");
}

// Общий секрет для релея (заголовок x-proxy-secret) — не даёт посторонним слать
// через наш релей. Пусто — заголовок не отправляется (релей тогда его не требует).
export function getTelegramProxySecret(): string {
  return process.env.TELEGRAM_PROXY_SECRET ?? "";
}

// Канал для автопостинга (@whygrid или числовой -100…). Пусто — постинг отключён.
// Бот должен быть админом канала с правом публикации (plans/2026-06-26-…-бот-постинг.md).
export function getTelegramChannelId(): string {
  return process.env.TELEGRAM_CHANNEL_ID ?? "";
}

// Публичный @username бота (без @) — для ссылок вида t.me/<username> (кнопка «Написать
// нам» в постах, ссылка «Написать в Telegram» на /support). Не секрет, дефолт задан.
export function getTelegramBotUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME ?? "whygrid_bot";
}

// Секрет webhook'а Telegram: бот шлёт его в заголовке X-Telegram-Bot-Api-Secret-Token
// при каждом обновлении; маршрут принимает апдейт, только если секрет совпал. Пусто —
// приём входящих не настроен (webhook не регистрируем). Хранить в .env, не в git.
export function getTelegramWebhookSecret(): string {
  return process.env.TELEGRAM_WEBHOOK_SECRET ?? "";
}

// Бот считается настроенным, только когда есть и токен, и адрес администратора.
// Иначе выбирается noop-адаптер — продукт работает без уведомлений (они вторичны).
export function isNotifyConfigured(): boolean {
  return getTelegramBotToken() !== "" && getTelegramAdminChatId() !== "";
}

// Порог «зависшей» задачи для дайджеста (architecture/06-внешние-сервисы.md, раздел 2.2:
// «Очередь не разгребается > 15 мин»): задача PENDING, чьё время запуска прошло раньше
// этого порога, считается зависшей — сигнал, что воркер не разгребает очередь.
const DEFAULT_QUEUE_STUCK_MINUTES = 15;

export function getQueueStuckThresholdMs(): number {
  const raw = process.env.QUEUE_STUCK_THRESHOLD_MINUTES;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  const minutes = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_QUEUE_STUCK_MINUTES;
  return minutes * 60 * 1000;
}

// Путь к «пульсу» дайджеста: файл, который сторож тишины на релее читает, чтобы понять,
// приходила ли утренняя сводка. Приложение обновляет его при УСПЕШНОЙ отправке; если файл
// не трогали больше суток — сторож (независимым Telegram-каналом на релее) бьёт тревогу.
// Так ловится «сводка молча пропала» (крон не сработал / релей лёг), а не только память
// Артёма «мне утром ничего не пришло». По умолчанию — рядом со служебными файлами приложения
// (POST_QUEUE_DIR, он уже задан на проде вне git); можно переопределить DIGEST_HEARTBEAT_FILE.
export function getDigestHeartbeatPath(): string {
  const explicit = process.env.DIGEST_HEARTBEAT_FILE;
  if (explicit) return explicit;
  const dir = process.env.POST_QUEUE_DIR ?? nodePath.join(process.cwd(), ".post-queue");
  return nodePath.join(dir, "digest-last-ok");
}

// ──────────────────── Устойчивость вызова Telegram через релей ───────────────
// Уведомления администратору (дайджест «Сводка за сутки», тревоги очереди, форма
// поддержки) идут на прод тем же релеем КЗ, что LLM и голос. Без таймаута зависший
// релей (принял соединение, но молчит) держит fetch дефолтом undici ~5 минут: дайджест
// молча виснет и, поскольку safeNotifyAdmin глушит ошибку, «теряется без следа». Тот же
// resilientFetch, что у разбора: таймаут + быстрый повтор при икоте релея (обрыв/502/504).
//
// Telegram отвечает за доли секунды — 15с даёт большой запас, не срезая честный ответ.
// В env (правило проекта №3 — лимиты в конфиге), чтобы тюнить с релея без передеплоя.
const DEFAULT_TELEGRAM_CALL_TIMEOUT_MS = 15_000;
export function getTelegramCallTimeoutMs(): number {
  const raw = Number(process.env.TELEGRAM_CALL_TIMEOUT_MS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_TELEGRAM_CALL_TIMEOUT_MS;
}

// Сколько раз ДОПОЛНИТЕЛЬНО переповторить вызов при ВРЕМЕННОМ сбое релея (обрыв
// соединения, 502/503/504 от перегруженного nginx) — по свежему соединению, с короткой
// паузой. Гасит разовую икоту незаметно. Полный таймаут этим НЕ повторяется (см.
// resilient-fetch.ts). 0 — без повторов. В env (правило 3).
const DEFAULT_TELEGRAM_CALL_RETRIES = 2;
export function getTelegramCallRetries(): number {
  const raw = Number(process.env.TELEGRAM_CALL_RETRIES);
  return Number.isInteger(raw) && raw >= 0 ? raw : DEFAULT_TELEGRAM_CALL_RETRIES;
}

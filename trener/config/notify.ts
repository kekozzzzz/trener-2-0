// Конфигурация служебного бота-сторожа (Telegram) — токен, адрес администратора и
// параметры релея живут только здесь и в .env (правило проекта №3, секреты в коде
// запрещены). Бизнес-логика и адаптер их не хардкодят.
//
// Сетевая особенность (см. architecture/06-внешние-сервисы.md, раздел 2.2 и
// project_llm_connectivity_block): прод-VM в РФ до api.telegram.org напрямую не
// достаёт — сообщения идут через тот же HTTPS-релей в Казахстане, что и Claude.
// Поэтому базовый адрес настраиваемый: на проде = релей, в деве/тестах пусто.

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

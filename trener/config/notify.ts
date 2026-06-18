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

// Бот считается настроенным, только когда есть и токен, и адрес администратора.
// Иначе выбирается noop-адаптер — продукт работает без уведомлений (они вторичны).
export function isNotifyConfigured(): boolean {
  return getTelegramBotToken() !== "" && getTelegramAdminChatId() !== "";
}

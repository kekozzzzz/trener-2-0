// Лимиты формы поддержки — бизнес-числа, живут только в конфиге/.env (правило
// проекта №3). Форма публичная и шлёт сообщение владельцу в Telegram, поэтому нужен
// антиспам (иначе чат владельца можно завалить) и потолок длины (одно сообщение не
// должно раздуться до простыни). Основание — architecture/07-безопасность.md, раздел
// «Лимиты на запросы на точках входа».

const DEFAULT_SUPPORT_MAX_PER_IP = 5; // сообщений с одного IP за окно
const DEFAULT_SUPPORT_WINDOW_MS = 60 * 60 * 1000; // окно — 1 час
const DEFAULT_SUPPORT_MAX_MESSAGE_LENGTH = 4000; // символов в сообщении

function intFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Сколько сообщений в поддержку допускается с одного IP за окно.
export function getSupportMaxPerIp(): number {
  return intFromEnv(process.env.SUPPORT_MAX_PER_IP, DEFAULT_SUPPORT_MAX_PER_IP);
}

export function getSupportWindowMs(): number {
  return intFromEnv(process.env.SUPPORT_WINDOW_MS, DEFAULT_SUPPORT_WINDOW_MS);
}

// Максимальная длина сообщения — лишнее обрезаем перед отправкой в Telegram.
export function getSupportMaxMessageLength(): number {
  return intFromEnv(process.env.SUPPORT_MAX_MESSAGE_LENGTH, DEFAULT_SUPPORT_MAX_MESSAGE_LENGTH);
}

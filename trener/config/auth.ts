// Лимиты на точках входа аутентификации — бизнес-числа, живут только в
// конфиге/.env (правило проекта №3). Основание — architecture/07-безопасность.md,
// раздел 2 «Лимиты на запросы на точках входа»: вход — ограничение числа
// неудачных попыток с временной блокировкой (защита от перебора паролей);
// регистрация — лимит по IP (защита от массового создания фейковых аккаунтов и
// от «прозвона» занятых email).

const DEFAULT_LOGIN_MAX_FAILURES_PER_EMAIL = 5;
const DEFAULT_LOGIN_MAX_FAILURES_PER_IP = 20;
const DEFAULT_LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 минут
const DEFAULT_REGISTER_MAX_PER_IP = 5;
const DEFAULT_REGISTER_WINDOW_MS = 60 * 60 * 1000; // 1 час
const DEFAULT_PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // ссылка живёт 1 час
const DEFAULT_PASSWORD_RESET_MAX_PER_IP = 5;
const DEFAULT_PASSWORD_RESET_WINDOW_MS = 60 * 60 * 1000; // 1 час
// Вход/регистрация по «волшебной ссылке» (passwordless). Срок короче, чем у сброса
// пароля: ссылка — это сам вход, держать её живой час незачем. Этим же сроком живёт
// и подписанная cookie «намерения регистрации» между кликом и экраном согласия.
const DEFAULT_MAGIC_LINK_TTL_MS = 15 * 60 * 1000; // ссылка живёт 15 минут
const DEFAULT_MAGIC_LINK_MAX_PER_IP = 5;
const DEFAULT_MAGIC_LINK_MAX_PER_EMAIL = 5;
const DEFAULT_MAGIC_LINK_WINDOW_MS = 60 * 60 * 1000; // 1 час
// Ссылка подтверждения закрытия аккаунта. Закрытие не срочное (в отличие от входа),
// поэтому час, как у сброса пароля.
const DEFAULT_ACCOUNT_CLOSURE_TTL_MS = 60 * 60 * 1000; // 1 час

function intFromEnv(raw: string | undefined, fallback: number): number {
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Сколько неудачных попыток входа на ОДИН email допускается за окно, прежде чем
// логин временно блокируется (точечная защита конкретного аккаунта от перебора).
export function getLoginMaxFailuresPerEmail(): number {
  return intFromEnv(process.env.AUTH_LOGIN_MAX_FAILURES_PER_EMAIL, DEFAULT_LOGIN_MAX_FAILURES_PER_EMAIL);
}

// Сколько неудачных попыток входа с ОДНОГО IP допускается за окно (защита от
// credential stuffing — перебора одного пароля по множеству чужих email).
export function getLoginMaxFailuresPerIp(): number {
  return intFromEnv(process.env.AUTH_LOGIN_MAX_FAILURES_PER_IP, DEFAULT_LOGIN_MAX_FAILURES_PER_IP);
}

export function getLoginWindowMs(): number {
  return intFromEnv(process.env.AUTH_LOGIN_WINDOW_MS, DEFAULT_LOGIN_WINDOW_MS);
}

// Сколько регистраций с одного IP допускается за окно.
export function getRegisterMaxPerIp(): number {
  return intFromEnv(process.env.AUTH_REGISTER_MAX_PER_IP, DEFAULT_REGISTER_MAX_PER_IP);
}

export function getRegisterWindowMs(): number {
  return intFromEnv(process.env.AUTH_REGISTER_WINDOW_MS, DEFAULT_REGISTER_WINDOW_MS);
}

// Срок жизни ссылки сброса пароля (07-безопасность.md: «ограниченное время жизни»).
export function getPasswordResetTtlMs(): number {
  return intFromEnv(process.env.AUTH_PASSWORD_RESET_TTL_MS, DEFAULT_PASSWORD_RESET_TTL_MS);
}

// Сколько запросов сброса с одного IP / на один email допускается за окно (защита
// от заваливания почтового ящика и от перебора существующих email).
export function getPasswordResetMaxPerIp(): number {
  return intFromEnv(process.env.AUTH_PASSWORD_RESET_MAX_PER_IP, DEFAULT_PASSWORD_RESET_MAX_PER_IP);
}

export function getPasswordResetWindowMs(): number {
  return intFromEnv(process.env.AUTH_PASSWORD_RESET_WINDOW_MS, DEFAULT_PASSWORD_RESET_WINDOW_MS);
}

// Срок жизни ссылки входа по «волшебной ссылке» (и cookie намерения регистрации).
export function getMagicLinkTtlMs(): number {
  return intFromEnv(process.env.AUTH_MAGIC_LINK_TTL_MS, DEFAULT_MAGIC_LINK_TTL_MS);
}

// Сколько запросов ссылки входа с одного IP / на один email допускается за окно
// (защита от заваливания ящика и от рассылки ссылок по чужим почтам).
export function getMagicLinkMaxPerIp(): number {
  return intFromEnv(process.env.AUTH_MAGIC_LINK_MAX_PER_IP, DEFAULT_MAGIC_LINK_MAX_PER_IP);
}

export function getMagicLinkMaxPerEmail(): number {
  return intFromEnv(process.env.AUTH_MAGIC_LINK_MAX_PER_EMAIL, DEFAULT_MAGIC_LINK_MAX_PER_EMAIL);
}

export function getMagicLinkWindowMs(): number {
  return intFromEnv(process.env.AUTH_MAGIC_LINK_WINDOW_MS, DEFAULT_MAGIC_LINK_WINDOW_MS);
}

// Срок жизни ссылки подтверждения закрытия аккаунта.
export function getAccountClosureTtlMs(): number {
  return intFromEnv(process.env.AUTH_ACCOUNT_CLOSURE_TTL_MS, DEFAULT_ACCOUNT_CLOSURE_TTL_MS);
}

// Лимитер считает попытки в памяти процесса. В тестах (vitest) выключен: весь
// прогон делит один процесс и общий IP-фолбэк «unknown», поэтому сквозной
// счётчик иначе перелился бы между несвязанными кейсами и ронял бы их. Чистые
// функции счётчика (features/auth/rate-limit.ts) от этого флага не зависят и
// проверяются отдельным тестом.
export function isAuthRateLimitEnabled(): boolean {
  return process.env.NODE_ENV !== "test" && !process.env.VITEST;
}

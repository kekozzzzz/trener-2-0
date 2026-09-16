// Конфигурация транзакционных писем (Unisender Go). Ключ и адрес отправителя живут
// только здесь и в .env (правило проекта №3, секреты в коде запрещены). Основание —
// architecture/06-внешние-сервисы.md, раздел 2.1: транзакционные письма игроку
// (подтверждение почты, сброс пароля) через сменный email-адаптер.
//
// Unisender Go — российский сервис, прод-VM из РФ достаёт его напрямую (в отличие от
// Claude/Telegram, которым нужен релей). Эндпоинт всё равно настраиваемый из .env —
// на случай смены домена API (go1/go2) без передеплоя.

// Аккаунт Артёма — на кластере go2 (панель go2.unisender.ru). Если аккаунт переедет
// на другой кластер, переопределить через EMAIL_API_URL в .env без правки кода.
const DEFAULT_API_URL = "https://go2.unisender.ru/ru/transactional/api/v1/email/send.json";

// API-ключ Unisender Go. Пусто — email не настроен, выбирается noop-адаптер (дев/тесты):
// продукт работает, письма молча не уходят.
export function getEmailApiKey(): string {
  return process.env.EMAIL_API_KEY ?? "";
}

// Полный URL эндпоинта отправки письма.
export function getEmailApiUrl(): string {
  return process.env.EMAIL_API_URL || DEFAULT_API_URL;
}

// Адрес отправителя («от кого»). Домен должен быть подтверждён в Unisender Go,
// иначе письма падают в спам (architecture/06, раздел 2.1).
export function getEmailFromAddress(): string {
  return process.env.EMAIL_FROM_ADDRESS ?? "no-reply@whygrid.app";
}

// Имя отправителя, которое видит получатель.
export function getEmailFromName(): string {
  return process.env.EMAIL_FROM_NAME ?? "Whygrid";
}

// Предел ожидания одного вызова к Unisender Go. Без него зависший сервис держит fetch
// дефолтом undici ~5 мин — server action (сброс пароля/подтверждение) висит, а если письмо
// шлётся из фоновой задачи — занимает лейн воркера. В .env (правило 3).
const DEFAULT_EMAIL_CALL_TIMEOUT_MS = 15_000;
export function getEmailCallTimeoutMs(): number {
  const raw = Number(process.env.EMAIL_CALL_TIMEOUT_MS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_EMAIL_CALL_TIMEOUT_MS;
}

// Email считается настроенным через Unisender, только когда есть API-ключ.
export function isEmailConfigured(): boolean {
  return getEmailApiKey() !== "";
}

// SMTP-канал (почтовый ящик support@whygrid.app, VK WorkSpace/mail.ru) — замена
// Unisender Go с 2026-09: объём писем (десятки в месяц) не оправдывает платный тариф
// транзакционного сервиса, а ящик уже оплачен для поддержки. Unisender-адаптер
// остаётся в дереве как запасной путь (правило 4) — включается обратно, если у SMTP
// когда-нибудь начнутся проблемы с доставляемостью, без нового деплоя кода.
export function getSmtpHost(): string {
  return process.env.EMAIL_SMTP_HOST ?? "";
}

export function getSmtpPort(): number {
  const raw = Number(process.env.EMAIL_SMTP_PORT);
  return Number.isInteger(raw) && raw > 0 ? raw : 465;
}

export function getSmtpUser(): string {
  return process.env.EMAIL_SMTP_USER ?? "";
}

export function getSmtpPassword(): string {
  return process.env.EMAIL_SMTP_PASSWORD ?? "";
}

export function isSmtpConfigured(): boolean {
  return getSmtpHost() !== "" && getSmtpUser() !== "" && getSmtpPassword() !== "";
}

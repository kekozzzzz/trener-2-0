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

// Email считается настроенным, только когда есть API-ключ. Иначе — noop-адаптер.
export function isEmailConfigured(): boolean {
  return getEmailApiKey() !== "";
}

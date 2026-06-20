// Конфигурация платёжного провайдера — выбор вендора, ключи и адрес API живут
// только здесь и в .env (правило проекта №3), бизнес-логика и адаптеры их не
// хардкодят. Ключи ЮKassa — секреты: только в .env, никогда в коде/гите
// (CLAUDE.md, запрет 1; architecture/07-безопасность.md).
//
// Фаза 1 платёжной стратегии — ЮKassa (РФ). Stripe появится позже отдельным
// адаптером за тем же портом (architecture/06-внешние-сервисы.md, журнал 2026-06-17).

// Какой адаптер использовать. "yookassa" — боевой; пусто/иное — фейк
// (дев-окружение без ключей и тесты), см. infrastructure/adapters/payments/index.ts.
export function getPaymentsProvider(): string {
  return process.env.PAYMENTS_PROVIDER ?? "";
}

// Идентификатор магазина ЮKassa (shopId). Выдаётся после прохождения модерации.
export function getYooKassaShopId(): string {
  return process.env.YOOKASSA_SHOP_ID ?? "";
}

// Секретный ключ ЮKassa. Боевой ключ — только на проде в .env, не в репозитории.
export function getYooKassaSecretKey(): string {
  return process.env.YOOKASSA_SECRET_KEY ?? "";
}

// Базовый адрес API ЮKassa. Вынесен в конфиг, чтобы тесты могли указать мок-хост,
// а прод — при необходимости — релей (платежи идут с РФ-сервера, ЮKassa из РФ
// доступна напрямую, но точку оставляем сменной по тому же принципу, что и LLM).
export function getYooKassaApiUrl(): string {
  return process.env.YOOKASSA_API_URL || "https://api.yookassa.ru/v3";
}

// Список доверенных IP-адресов вебхуков ЮKassa (CIDR/одиночные), через запятую.
// Обработчик вебхука принимает уведомления только с них (плюс перепроверяет платёж
// через API). Пусто — проверка по IP выключена (полагаемся только на re-fetch).
export function getYooKassaWebhookIps(): string[] {
  return (process.env.YOOKASSA_WEBHOOK_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

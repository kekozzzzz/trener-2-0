// Яндекс.Метрика — веб-аналитика посещаемости и целей (в т.ч. A/B-тест заголовка на
// главной, config/growth.ts). Правило 3: идентификатор счётчика — только из .env, не
// хардкод. Пусто — счётчик не подключается, сайт работает как и работал (components/site/
// metrika.tsx рендерит null) — тот же принцип «noop без конфигурации», что у notify/email.
//
// NEXT_PUBLIC_-префикс обязателен: значение уходит в клиентский бандл (счётчик грузится
// в браузере), это не секрет — как и сам номер счётчика Метрики у любого сайта.
export function getYandexMetrikaId(): string {
  return process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID ?? "";
}

export function isMetrikaConfigured(): boolean {
  return getYandexMetrikaId().trim() !== "";
}

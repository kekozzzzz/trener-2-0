// Базовый публичный адрес приложения — нужен, чтобы строить абсолютные ссылки в
// письмах (например, ссылку сброса пароля). Без хвостового слэша.
//
// Приоритет: явный APP_BASE_URL из .env (переопределение для нестандартных случаев)
// → иначе боевой домен в проде, localhost в деве/тестах. Так ссылки в письмах сразу
// корректны на проде без настройки .env, а локально не уводят на боевой сайт.
const PRODUCTION_BASE_URL = "https://whygrid.app";

export function getAppBaseUrl(): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, "");
  return process.env.NODE_ENV === "production" ? PRODUCTION_BASE_URL : "http://localhost:3000";
}

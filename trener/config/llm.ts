// Конфигурация LLM-провайдера — модель и ключ живут только здесь и в .env,
// бизнес-логика и адаптеры их не хардкодят (правило проекта №3).

const DEFAULT_MODEL = "claude-sonnet-4-6";

export function getAnthropicApiKey(): string {
  return process.env.ANTHROPIC_API_KEY ?? "";
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

// Прокси для вызовов Claude. Нужен, когда сервер стоит в регионе, который Anthropic
// не обслуживает (например РФ — запрос с местного IP отбивается 403). Запросы идут
// через CONNECT-туннель: прокси не расшифровывает трафик, ключ и данные раздач
// шифрованы насквозь до Anthropic. Пусто — ходим к Claude напрямую.
export function getAnthropicProxyUrl(): string {
  return process.env.ANTHROPIC_PROXY_URL ?? "";
}

// Конфигурация LLM-провайдера — модель и ключ живут только здесь и в .env,
// бизнес-логика и адаптеры их не хардкодят (правило проекта №3).

const DEFAULT_MODEL = "claude-sonnet-4-6";

// Потолок длины ответа модели. CRITICAL-разбор возвращает четыре текстовых поля
// (played/optimal/question/draftVerdict) на русском — при 1024 токенах самые
// длинные раздачи обрезались на полуслове, и JSON переставал парситься
// («Claude вернул невалидный JSON»). 2048 даёт запас; значение вынесено в env,
// чтобы при нужде поднять без передеплоя (правило проекта №3 — лимиты в конфиге).
const DEFAULT_MAX_TOKENS = 2048;

export function getAnthropicApiKey(): string {
  return process.env.ANTHROPIC_API_KEY ?? "";
}

export function getAnthropicModel(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

export function getAnthropicMaxTokens(): number {
  const raw = Number(process.env.ANTHROPIC_MAX_TOKENS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_MAX_TOKENS;
}

// Прокси для вызовов Claude. Нужен, когда сервер стоит в регионе, который Anthropic
// не обслуживает (например РФ — запрос с местного IP отбивается 403). Запросы идут
// через CONNECT-туннель: прокси не расшифровывает трафик, ключ и данные раздач
// шифрованы насквозь до Anthropic. Пусто — ходим к Claude напрямую.
export function getAnthropicProxyUrl(): string {
  return process.env.ANTHROPIC_PROXY_URL ?? "";
}

// Базовый адрес для запросов к Claude. Когда задан — SDK шлёт запросы сюда вместо
// api.anthropic.com (наш HTTPS-релей, nginx-шлюз на VPS в Казахстане, который пересылает
// их к Anthropic с не-российского IP — снимает гео-блок 403; прод в РФ напрямую не пускают).
// Пусто — ходим на api.anthropic.com напрямую.
export function getAnthropicBaseUrl(): string {
  return process.env.ANTHROPIC_BASE_URL ?? "";
}

// Общий секрет, которым сервер подписывает запросы к релею (заголовок x-proxy-secret).
// Не даёт посторонним использовать наш релей к Anthropic. Пусто —
// заголовок не отправляется (релей тогда тоже не должен его требовать).
export function getAnthropicProxySecret(): string {
  return process.env.ANTHROPIC_PROXY_SECRET ?? "";
}

// Путь к сертификату релея (самоподписанный cert nginx-шлюза в Казахстане). Когда задан —
// клиент доверяет именно этому сертификату при обращении к ANTHROPIC_BASE_URL (пиннинг),
// а не отключает проверку TLS целиком. Пусто — обычная системная проверка сертификата.
export function getAnthropicProxyCa(): string {
  return process.env.ANTHROPIC_PROXY_CA ?? "";
}

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

// ───────────────────────── Выбор провайдера LLM ──────────────────────────────
// Какой провайдер обслуживает прод: "anthropic" (Sonnet, запасной) или "openrouter"
// (DeepSeek, основной — дешевле в ~16×). Переключение — одним env-флагом без передеплоя
// (Правило 3), это же и мгновенный откат. По умолчанию anthropic (совместимость/тесты).
export type LlmProvider = "anthropic" | "openrouter";
export function getLlmProvider(): LlmProvider {
  return process.env.LLM_PROVIDER === "openrouter" ? "openrouter" : "anthropic";
}

// ───────────────────────── OpenRouter (шлюз к DeepSeek) ──────────────────────
const DEFAULT_OPENROUTER_MODEL = "deepseek/deepseek-v3.2";

export function getOpenRouterApiKey(): string {
  return process.env.OPENROUTER_API_KEY ?? "";
}

export function getOpenRouterModel(): string {
  return process.env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL;
}

// Базовый адрес OpenAI-совместимого API (до «/chat/completions»). В проде указывает на
// казахский релей (прямой выход из РФ во внешние API ненадёжен), который пересылает запрос
// в openrouter.ai с не-российского IP. Локально/в будущем — прямой https://openrouter.ai/api/v1.
export function getOpenRouterBaseUrl(): string {
  return process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
}

// Предел ожидания ОДНОГО боевого вызова LLM через релей. Без него зависший релей (принял
// соединение, но не отвечает) держит fetch по дефолту undici ~5 минут — воркер очереди
// всё это время занят задачей в PROCESSING, весь разбор турнира «замерзает», а ретраи с
// backoff растягивают одну раздачу на ~15 минут. С таймаутом вызов падает быстро, лейн
// воркера освобождается, задача уходит в обычный retry/карантин. Реальный вызов раздачи
// ~10с, сводка турнира — десятки секунд; 45с даёт тройной запас над реальным временем, не
// срезая честный ответ, но быстрее сдаётся, когда релей уже тупит (для живого диалога важнее
// отзывчивость — решение Артёма 2026-07-10). В env (правило 3), тюнится с релея без передеплоя.
const DEFAULT_LLM_CALL_TIMEOUT_MS = 45_000;
export function getLlmCallTimeoutMs(): number {
  const raw = Number(process.env.LLM_CALL_TIMEOUT_MS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_LLM_CALL_TIMEOUT_MS;
}

// Сколько раз ДОПОЛНИТЕЛЬНО переповторить вызов при ВРЕМЕННОМ сбое релея (обрыв
// соединения, 502/503/504 от перегруженного nginx) — по свежему соединению, с короткой
// паузой. Гасит разовую икоту релея незаметно для человека. Полный таймаут этим НЕ
// повторяется (см. resilient-fetch.ts). 0 — без повторов. В env (правило 3).
const DEFAULT_LLM_CALL_RETRIES = 2;
export function getLlmCallRetries(): number {
  const raw = Number(process.env.LLM_CALL_RETRIES);
  return Number.isInteger(raw) && raw >= 0 ? raw : DEFAULT_LLM_CALL_RETRIES;
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

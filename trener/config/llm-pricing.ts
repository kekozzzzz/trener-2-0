// Ставки Claude за 1M токенов — внешний факт, живёт в конфиге (правило проекта №3).
// Нужны для расчёта себестоимости разбора и «кэш-нетто» (факт vs без кэша).
// Источник: прайс Anthropic. cacheWrite = 1.25× input (5-мин TTL), cacheRead = 0.1× input.

export type ModelRate = {
  input: number; // $/1M входных токенов (не из кэша)
  output: number; // $/1M выходных
  cacheWrite: number; // $/1M записанных в кэш
  cacheRead: number; // $/1M прочитанных из кэша
};

const RATES: Record<string, ModelRate> = {
  "claude-sonnet-4-6": { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  "claude-opus-4-8": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
  "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
  // DeepSeek через OpenRouter (основной провайдер, ~16× дешевле Sonnet). У DeepSeek
  // кэш контекста свой: попадание в кэш ≈0.1× входа, отдельной платы за запись нет.
  "deepseek/deepseek-v3.2": { input: 0.27, output: 1.1, cacheWrite: 0.27, cacheRead: 0.027 },
  // STT Voxtral (микрофон). Текстовые ставки с прайса OpenRouter 2026-07-04; ⚠️аудио
  // тарифицируется отдельно и в токенные ставки не влезает — это ЗАНИЖЕННЫЙ fallback
  // на случай, когда OpenRouter не вернул точную цену (usage.cost пишется как есть).
  "mistralai/voxtral-small-24b-2507": { input: 0.1, output: 0.3, cacheWrite: 0.1, cacheRead: 0.01 },
};

// Неизвестная модель → ставки sonnet-4.6 (рабочая по умолчанию), чтобы расчёт не падал.
const FALLBACK: ModelRate = RATES["claude-sonnet-4-6"];

export function getModelRate(model: string): ModelRate {
  return RATES[model] ?? FALLBACK;
}

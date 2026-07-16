// Ставки моделей за 1M токенов — внешний факт, живёт в конфиге (правило проекта №3).
// Нужны для расчёта себестоимости разбора и «кэш-нетто» (факт vs без кэша).
//
// ⚠️ЛЮБАЯ модель, которую ставим в OPENROUTER_MODEL, ОБЯЗАНА быть здесь: неизвестная уходит в
// FALLBACK (ставки Sonnet, $3/$15) и учёт затрат врёт в РАЗЫ. Так и было с 14.07 по 16.07 —
// боевой Gemini считался по Sonnet, /status завышал расходы примерно в 10×.
//
// Цены проверены по прайсу OpenRouter 2026-07-16 (замер в этой же сессии).
// ⚠️КЭШ ПРОМПТА ПРОВЕРЕН ЖИВЫМИ ВЫЗОВАМИ 2026-07-16 (у нас ~24k входных токенов на вызов,
// ~90% себестоимости — вход, поэтому кэш решает экономику):
//   • gemini-3.1-flash-lite — 79% из кэша СТАБИЛЬНО (лучший);
//   • gemini-2.5-flash — скачет 99% → 0% → 99% (себестоимость плавает вдвое);
//   • glm-5.2 — 0%, НЕ кэшируется вообще → вход по полной ставке $0.93/M;
//   • deepseek-v3.2 — 0%, НЕ кэшируется (вопреки прежнему допущению cacheRead 0.1×).
// Для моделей без кэша cacheRead = input (иначе расчёт занижает реальные расходы).

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
  // ── Gemini через OpenRouter ───────────────────────────────────────────────
  // Боевая модель с 2026-07-14. Кэш implicit (Google), платы за запись нет; чтение ≈0.25× входа,
  // но попадание НЕСТАБИЛЬНО (замер: 99%/0%/99%) — реальная себестоимость плавает.
  "google/gemini-2.5-flash": { input: 0.3, output: 2.5, cacheWrite: 0.3, cacheRead: 0.075 },
  // Кандидат на замену (16.07): втрое дешевле 2.5 по выходу, кэш 79% стабильно, ответ ~4с.
  "google/gemini-3.1-flash-lite": { input: 0.25, output: 1.5, cacheWrite: 0.25, cacheRead: 0.0625 },
  // Кандидаты, прошедшие скрининг 16.07 (JSON + скорость + кэш). Качество на сложных раздачах
  // НЕ мерено — только полным прогоном.
  "z-ai/glm-4.7-flash": { input: 0.06, output: 0.4, cacheWrite: 0.06, cacheRead: 0.015 }, // кэш 100%, вчетверо дешевле 3.1
  "nex-agi/nex-n2-pro": { input: 0.25, output: 1.0, cacheWrite: 0.25, cacheRead: 0.0625 }, // кэш 100%
  "qwen/qwen3.7-plus": { input: 0.32, output: 1.28, cacheWrite: 0.32, cacheRead: 0.08 }, // кэш 93%; ⚠️лезет латиница в русский
  // ⛔Кэш 0% (замер 16.07) → cacheRead = input, вход по полной: экономически хуже, чем кажется по прайсу.
  "google/gemini-3-flash-preview": { input: 0.5, output: 3.0, cacheWrite: 0.5, cacheRead: 0.5 },
  "minimax/minimax-m3": { input: 0.3, output: 1.2, cacheWrite: 0.3, cacheRead: 0.3 },
  // ── GLM (был в бою до Gemini) ─────────────────────────────────────────────
  // ⛔Кэш НЕ работает (замер 0/0/0) → cacheRead = input. С нашим промптом ~$0.82/турнир против
  // дохода $0.28 при тарифе $7/25 — экономически невозможен, сколь угодно хорош по качеству.
  "z-ai/glm-5.2": { input: 0.93, output: 2.93, cacheWrite: 0.93, cacheRead: 0.93 },
  // ── DeepSeek через OpenRouter ─────────────────────────────────────────────
  // ⚠️Правки 16.07: output был 1.1 (устарел, реально 0.40); кэш НЕ работает (замер 0/0/0) —
  // прежнее допущение cacheRead 0.027 занижало расходы в 10×. Медленный: ~20с на разбор.
  "deepseek/deepseek-v3.2": { input: 0.27, output: 0.4, cacheWrite: 0.27, cacheRead: 0.27 },
  // Новое поколение (2026-04): вдвое дешевле v3.2, но ещё медленнее (~38с) — по скорости не проходит.
  "deepseek/deepseek-v4-flash": { input: 0.1, output: 0.2, cacheWrite: 0.1, cacheRead: 0.1 },
  // STT Voxtral (микрофон). Текстовые ставки с прайса OpenRouter 2026-07-04; ⚠️аудио
  // тарифицируется отдельно и в токенные ставки не влезает — это ЗАНИЖЕННЫЙ fallback
  // на случай, когда OpenRouter не вернул точную цену (usage.cost пишется как есть).
  "mistralai/voxtral-small-24b-2507": { input: 0.1, output: 0.3, cacheWrite: 0.1, cacheRead: 0.01 },
};

// Неизвестная модель → ставки sonnet-4.6, чтобы расчёт не падал. ⚠️Это ЗАВЫШЕНИЕ (Sonnet в ~10×
// дороже Flash): молчаливый fallback уже приводил к вранью в /status. Ставишь новую модель в
// OPENROUTER_MODEL — сначала добавь её сюда.
const FALLBACK: ModelRate = RATES["claude-sonnet-4-6"];

export function getModelRate(model: string): ModelRate {
  return RATES[model] ?? FALLBACK;
}

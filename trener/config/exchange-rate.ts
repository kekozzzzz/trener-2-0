// Конфигурация источника курса валют — выбор провайдера и запасной курс живут только
// здесь и в .env (правило 3). Цены тарифов указаны в долларах, а ЮKassa списывает рубли,
// поэтому при оплате доллары пересчитываются в рубли по курсу ЦБ РФ (раз в сутки).

// Какой провайдер курса использовать. "cbr" — боевой (ЦБ РФ, кэш на сутки); пусто/иное —
// фейк с фиксированным курсом (дев без сети и тесты). См. adapters/exchange-rate/index.ts.
export function getExchangeRateProvider(): string {
  return process.env.EXCHANGE_RATE_PROVIDER ?? "";
}

// Запасной курс ₽ за $1 — когда источник недоступен И в деве/тестах (фейк). Бизнес-число
// (правило 3): обновляется в .env (USD_RUB_FALLBACK), не хардкодится в логике. Дефолт —
// осторожно завышенный, чтобы при сбое источника не списать меньше себестоимости.
export function getFallbackUsdRub(): number {
  const v = Number(process.env.USD_RUB_FALLBACK);
  return Number.isFinite(v) && v > 0 ? v : 95;
}

// Предел ожидания вызова к источнику курса. Без него зависший источник держит fetch
// дефолтом undici ~5 мин ПЕРЕД тем, как сработает запасной курс — а вызов идёт из фонового
// автопродления (занимает лейн воркера). С таймаутом запасной курс берётся быстро. Курс
// нужен редко (раз в сутки, кэш), короткий таймаут не мешает. В .env (правило 3).
const DEFAULT_EXCHANGE_RATE_TIMEOUT_MS = 8_000;
export function getExchangeRateCallTimeoutMs(): number {
  const raw = Number(process.env.EXCHANGE_RATE_TIMEOUT_MS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_EXCHANGE_RATE_TIMEOUT_MS;
}

// Курс ЦБ РФ через публичный JSON ЦБ (cbr-xml-daily.ru/daily_json.js). Кэш на сутки:
// курс ЦБ обновляется раз в день, поэтому одного запроса в день достаточно — лишней
// нагрузки и затрат нет. При недоступности источника отдаём запасной курс из конфига
// (НЕ кэшируем его — чтобы при восстановлении источника сразу взять реальный курс).

import { getFallbackUsdRub, getExchangeRateCallTimeoutMs } from "@/config/exchange-rate";
import type { ExchangeRatePort } from "./types";

const SOURCE = "https://www.cbr-xml-daily.ru/daily_json.js";

// Защита денежного пути: курс из внешнего источника напрямую задаёт сумму списания,
// поэтому проверяем его вменяемость. Значение вне диапазона (ошибка/подмена источника)
// отбрасываем — берём запасной курс, а не списываем абсурдную сумму.
const MIN_RUB_PER_USD = 30;
const MAX_RUB_PER_USD = 300;

let cache: { rate: number; day: string } | null = null;

function today(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD по UTC
}

export const cbrExchangeRate: ExchangeRatePort = {
  async getUsdRub(): Promise<number> {
    const day = today();
    if (cache && cache.day === day) return cache.rate;

    try {
      // Таймаут, чтобы при зависшем источнике быстро уйти в запасной курс (catch ниже),
      // а не держать фоновый лейн автопродления ~5 мин дефолтом undici.
      const res = await fetch(SOURCE, { signal: AbortSignal.timeout(getExchangeRateCallTimeoutMs()) });
      if (!res.ok) throw new Error(`ЦБ курс: HTTP ${res.status}`);
      const json = (await res.json()) as { Valute?: { USD?: { Value?: number } } };
      const rate = json.Valute?.USD?.Value;
      if (typeof rate !== "number" || rate < MIN_RUB_PER_USD || rate > MAX_RUB_PER_USD) {
        throw new Error(`ЦБ курс: значение вне диапазона (${rate})`);
      }
      cache = { rate, day };
      return rate;
    } catch (e) {
      console.error("ЦБ курс недоступен — использую запасной курс из конфига", e);
      return getFallbackUsdRub();
    }
  },
};

// Фейковый источник курса — дев без сети и тесты. Отдаёт фиксированный курс из конфига
// (USD_RUB_FALLBACK), в сеть не ходит.

import { getFallbackUsdRub } from "@/config/exchange-rate";
import type { ExchangeRatePort } from "./types";

export const fakeExchangeRate: ExchangeRatePort = {
  async getUsdRub(): Promise<number> {
    return getFallbackUsdRub();
  },
};

import { getExchangeRateProvider } from "@/config/exchange-rate";
import { cbrExchangeRate } from "./cbr";
import { fakeExchangeRate } from "./fake";
import type { ExchangeRatePort } from "./types";

// ЦБ РФ — когда выбран провайдер "cbr"; иначе фейк (фикс. курс, дев/тесты).
export function getExchangeRateAdapter(): ExchangeRatePort {
  return getExchangeRateProvider() === "cbr" ? cbrExchangeRate : fakeExchangeRate;
}

export type { ExchangeRatePort } from "./types";

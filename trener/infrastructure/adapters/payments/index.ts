import { getPaymentsProvider, getYooKassaSecretKey, getYooKassaShopId } from "@/config/payments";
import { fakePaymentsAdapter } from "./fake";
import { yooKassaPaymentsAdapter } from "./yookassa";
import type { PaymentsPort } from "./types";

// ЮKassa — когда выбран провайдер "yookassa" И заданы оба ключа; иначе фейк
// (дев-окружение без ключей и тесты). Тот же принцип выбора, что у adapters/llm.
export function getPaymentsAdapter(): PaymentsPort {
  const useYooKassa =
    getPaymentsProvider() === "yookassa" && Boolean(getYooKassaShopId()) && Boolean(getYooKassaSecretKey());
  return useYooKassa ? yooKassaPaymentsAdapter : fakePaymentsAdapter;
}

export type {
  ChargeSavedParams,
  ChargeSavedResult,
  CreateCheckoutParams,
  CreateCheckoutResult,
  Money,
  PaymentsPort,
  ProviderPayment,
  ProviderPaymentStatus,
} from "./types";

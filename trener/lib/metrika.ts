import { getYandexMetrikaId, isMetrikaConfigured } from "@/config/analytics";

declare global {
  interface Window {
    ym?: (counterId: number, action: string, ...rest: unknown[]) => void;
  }
}

// Отправка цели в Яндекс.Метрику. Без настроенного счётчика (config/analytics.ts) —
// тихий no-op, как и остальные опциональные интеграции проекта. Используется из клиентских
// компонентов (components/site/headline-impression.tsx, headline-cta-link.tsx) для
// A/B-теста заголовка на главной — без своей таблицы в базе, решение Артёма 2026-08-13.
export function reachGoal(target: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !isMetrikaConfigured()) return;
  const counterId = Number(getYandexMetrikaId());
  if (!Number.isFinite(counterId) || !window.ym) return;
  window.ym(counterId, "reachGoal", target, params);
}

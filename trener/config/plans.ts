// Тарифы подписки — бизнес-конфиг (правило проекта №3: цены и лимиты только здесь/в БД,
// никогда в бизнес-логике). Подробности модели — plans/2026-06-21-кредитная-система.md.
//
// monthlyBudgetUsd — ПОТОЛОК себестоимости ИИ ($) на период подписки. Он и гарантирует
// маржу: бюджет всегда меньше «чистой» цены тарифа, поэтому, что бы подписчик ни делал,
// в минус не уходим (стена не даёт превысить бюджет). Считаем по реальной стоимости из
// таблицы LlmUsage. «~разборов» (оценка при среднем использовании ~$0.25/разбор) — это
// маркетинговая прикидка, человеку счётчик НЕ показываем.
//
// Расчёт (курс 75 ₽/$, комиссия ЮKassa ~3.5%):
//   Базовый      690 ₽  → чистыми 666 ₽  → бюджет $4.0  (~16 разборов) → маржа ~366 ₽
//   Продвинутый  1490 ₽ → чистыми 1438 ₽ → бюджет $12.5 (~50 разборов) → маржа ~500 ₽
//   Максимальный 3490 ₽ → чистыми 3368 ₽ → бюджет $31.5 (~125 разборов) → маржа ~1000 ₽

export type Plan = {
  code: string;
  title: string;
  priceRub: number; // цена подписки в рублях за период
  monthlyBudgetUsd: number; // потолок себестоимости ИИ ($) за период подписки
};

export const PLANS: readonly Plan[] = [
  { code: "basic", title: "Базовый", priceRub: 690, monthlyBudgetUsd: 4.0 },
  { code: "advanced", title: "Продвинутый", priceRub: 1490, monthlyBudgetUsd: 12.5 },
  { code: "max", title: "Максимальный", priceRub: 3490, monthlyBudgetUsd: 31.5 },
] as const;

// Бесплатный доступ без подписки: детерминированное ядро — всегда; первый турнир-разбор
// (с диалогом) — бесплатно. Дальше платные ИИ-действия упираются в paywall.
export const FREE_TOURNAMENT_LIMIT = 1;

// Включение подписочного гейта (paywall/стена). По умолчанию ВЫКЛ: пока не дошит
// subscribe-флоу ЮKassa, нельзя запирать бесплатных без возможности оплатить. Включаем
// в .env, когда реально открываем монетизацию: SUBSCRIPTION_GATE_ENABLED=true.
// (В тестах тоже выключен — существующие сценарии грузят много турниров без подписки.)
export function isSubscriptionGateEnabled(): boolean {
  return process.env.SUBSCRIPTION_GATE_ENABLED === "true";
}

export function getPlan(code: string | null | undefined): Plan | null {
  return PLANS.find((p) => p.code === code) ?? null;
}

export function getPlanBudgetUsd(code: string | null | undefined): number | null {
  return getPlan(code)?.monthlyBudgetUsd ?? null;
}

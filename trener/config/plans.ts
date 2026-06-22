// Тарифы подписки — ЕДИНЫЙ источник правды (правило проекта №3: цены, лимиты тиров
// и имя модели живут только в конфиге/БД, никогда в бизнес-логике или в разметке
// страниц). Здесь сходятся ОБА аспекта тарифа:
//   • деньги для оплаты ЮKassa — amountKopecks (целое в копейках рубля, как
//     Payment.amountCents в схеме; никогда float/Decimal);
//   • потолок потребления ИИ — monthlyBudgetUsd (кредитная модель,
//     plans/2026-06-21-кредитная-система.md).
//
// monthlyBudgetUsd — ПОТОЛОК себестоимости ИИ ($) на период подписки. Он и гарантирует
// маржу: бюджет всегда меньше «чистой» цены тарифа, поэтому, что бы подписчик ни делал,
// в минус не уходим (стена не даёт превысить бюджет). Считаем по реальной стоимости из
// таблицы LlmUsage. approxAnalyses — мягкая маркетинговая оценка (при ~$0.25/разбор);
// живого счётчика «сколько осталось» человеку НЕ показываем (тревога счётчика).
//
// Цены и бюджеты согласованы с Артёмом 2026-06-21 (курс 75 ₽/$, комиссия ЮKassa ~3.5%):
//   Базовый      690 ₽  → чистыми 666 ₽  → бюджет $4.0  (~16 разборов) → маржа ~366 ₽
//   Продвинутый  1490 ₽ → чистыми 1438 ₽ → бюджет $12.5 (~50 разборов) → маржа ~500 ₽
//   Максимальный 3490 ₽ → чистыми 3368 ₽ → бюджет $31.5 (~125 разборов) → маржа ~1000 ₽
// Менять цены/бюджеты без явного решения нельзя (CLAUDE.md, «спроси разрешения»).

// Коды тарифов — то, что хранится в Subscription.planCode и приходит в metadata
// платежа. Не менять без миграции существующих подписок (под них завязан гейт бюджета).
export type PlanCode = "basic" | "standard" | "max";

export type Plan = {
  code: PlanCode;
  title: string;
  description: string; // одна строка под заголовком тарифа на странице цен
  amountKopecks: number; // цена за один период (месяц), в копейках рубля — для оплаты
  monthlyBudgetUsd: number; // потолок себестоимости ИИ ($) за период подписки — для гейта
  approxAnalyses: number; // мягкая оценка «≈ N разборов в месяц» для страницы цен
};

const CURRENCY = "RUB";
const PERIOD_DAYS = 30; // длительность оплаченного периода подписки
const FREE_TOURNAMENT_LIMIT = 1; // первый турнир бесплатно (до оформления подписки)

// Порядок в массиве = порядок показа на странице тарифов.
const PLANS: Record<PlanCode, Plan> = {
  basic: {
    code: "basic",
    title: "Базовый",
    description: "Разбирай турниры и спрашивай «почему» по ключевым раздачам",
    amountKopecks: 69_000,
    monthlyBudgetUsd: 4.0,
    approxAnalyses: 16,
  },
  standard: {
    code: "standard",
    title: "Продвинутый",
    description: "Учись на всех своих руках, а не только на ключевых",
    amountKopecks: 149_000,
    monthlyBudgetUsd: 12.5,
    approxAnalyses: 50,
  },
  max: {
    code: "max",
    title: "Максимальный",
    description: "Для тех, кто играет много и хочет разбирать всё",
    amountKopecks: 349_000,
    monthlyBudgetUsd: 31.5,
    approxAnalyses: 125,
  },
};

const PLAN_ORDER: PlanCode[] = ["basic", "standard", "max"];

export const PLANS_LIST: readonly Plan[] = PLAN_ORDER.map((code) => PLANS[code]);

export function getPlans(): Plan[] {
  return PLAN_ORDER.map((code) => PLANS[code]);
}

// Тариф по коду. null — если код неизвестен (внешний вход не доверяем).
export function getPlan(code: string | null | undefined): Plan | null {
  if (!code) return null;
  return (PLANS as Record<string, Plan | undefined>)[code] ?? null;
}

export function isPlanCode(code: string): code is PlanCode {
  return code in PLANS;
}

export function getCurrency(): string {
  return CURRENCY;
}

export function getSubscriptionPeriodDays(): number {
  return PERIOD_DAYS;
}

export function getFreeTournamentLimit(): number {
  return FREE_TOURNAMENT_LIMIT;
}

// Потолок себестоимости ($) тарифа для гейта бюджета. null — неизвестный план.
export function getPlanBudgetUsd(code: string | null | undefined): number | null {
  return getPlan(code)?.monthlyBudgetUsd ?? null;
}

// Включение подписочного гейта (paywall/стена). По умолчанию ВЫКЛ: пока не дошит
// subscribe-флоу ЮKassa, нельзя запирать бесплатных без возможности оплатить. Включаем
// в .env, когда реально открываем монетизацию: SUBSCRIPTION_GATE_ENABLED=true.
// (В тестах тоже выключен — существующие сценарии грузят много турниров без подписки.)
export function isSubscriptionGateEnabled(): boolean {
  return process.env.SUBSCRIPTION_GATE_ENABLED === "true";
}

// Форматирование копеек в рублёвую строку для UI: 69000 → «690 ₽», 200050 → «2 000,50 ₽».
// Тонкая утилита показа — числа берутся из тарифов выше, здесь только вид.
export function formatRubles(amountKopecks: number): string {
  const rubles = amountKopecks / 100;
  const hasKopecks = amountKopecks % 100 !== 0;
  const formatted = rubles.toLocaleString("ru-RU", {
    minimumFractionDigits: hasKopecks ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ₽`;
}

// Тарифы подписки — ЕДИНЫЙ источник правды (правило проекта №3: цены, лимиты тиров
// и имя модели живут только в конфиге/БД, никогда в бизнес-логике или в разметке
// страниц). Здесь сходятся ОБА аспекта тарифа:
//   • цена тарифа в ДОЛЛАРАХ — priceUsd (показываем в $; расходы на ИИ тоже в $, поэтому
//     цена в долларах держит маржу стабильной при любом курсе). При оплате доллары
//     пересчитываются в рубли по курсу ЦБ РФ (usdToKopecks + adapters/exchange-rate);
//     ЮKassa списывает рубли (Payment.amountCents — целое в копейках рубля).
//   • потолок потребления ИИ — monthlyBudgetUsd (кредитная модель,
//     plans/2026-06-21-кредитная-система.md).
//
// monthlyBudgetUsd — ПОТОЛОК себестоимости ИИ ($) на период подписки. Он и гарантирует
// маржу: бюджет всегда меньше цены тарифа, поэтому, что бы подписчик ни делал, в минус не
// уходим (стена не даёт превысить бюджет). Считаем по реальной стоимости из таблицы
// LlmUsage. Конкретное число разборов человеку НЕ показываем (намеренно, без тревоги
// счётчика) — тарифы различаются для пользователя только ценой и позиционированием.
//
// Цены и бюджеты согласованы с Артёмом 2026-06-22 (показ в $, оплата в ₽ по курсу ЦБ):
//   Базовый      $9  → бюджет $4.0  (~16 разборов)
//   Продвинутый  $20 → бюджет $12.5 (~50 разборов)
//   Максимальный $50 → бюджет $31.5 (~125 разборов)
// Менять цены/бюджеты без явного решения нельзя (CLAUDE.md, «спроси разрешения»).

// Коды тарифов — то, что хранится в Subscription.planCode и приходит в metadata
// платежа. Не менять без миграции существующих подписок (под них завязан гейт бюджета).
export type PlanCode = "basic" | "standard" | "max";

export type Plan = {
  code: PlanCode;
  title: string;
  description: string; // одна строка под заголовком тарифа на странице цен
  priceUsd: number; // цена за период (месяц) в долларах — показ и база пересчёта в ₽
  monthlyBudgetUsd: number; // потолок себестоимости ИИ ($) за период подписки — для гейта
};

const CURRENCY = "RUB";
const PERIOD_DAYS = 30; // длительность оплаченного периода подписки
const FREE_TOURNAMENT_LIMIT = 1; // первый турнир бесплатно (до оформления подписки)

// Порядок в массиве = порядок показа на странице тарифов.
const PLANS: Record<PlanCode, Plan> = {
  basic: {
    code: "basic",
    title: "Базовый",
    description: "Если разбираешь турниры время от времени",
    priceUsd: 9,
    monthlyBudgetUsd: 4.0,
  },
  standard: {
    code: "standard",
    title: "Продвинутый",
    description: "Если играешь и разбираешь регулярно",
    priceUsd: 20,
    monthlyBudgetUsd: 12.5,
  },
  max: {
    code: "max",
    title: "Максимальный",
    description: "Если играешь помногу и хочешь разбирать всё",
    priceUsd: 50,
    monthlyBudgetUsd: 31.5,
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

// Цена тарифа для показа: «$9». Тарифы показываем в долларах; рубли — только при оплате.
export function formatUsd(priceUsd: number): string {
  return `$${priceUsd}`;
}

// Сумма к списанию в копейках рубля при оплате: цена тарифа ($) × курс ₽/$, округлённая
// до целого рубля. Курс берётся из адаптера курса в момент оплаты (ЦБ РФ, кэш на сутки).
export function usdToKopecks(priceUsd: number, rubPerUsd: number): number {
  return Math.round(priceUsd * rubPerUsd) * 100;
}

// Форматирование копеек в рублёвую строку для UI: 81000 → «810 ₽», 200050 → «2 000,50 ₽».
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

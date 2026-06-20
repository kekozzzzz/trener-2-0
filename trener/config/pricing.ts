// Тарифы и параметры подписки — бизнес-числа, поэтому живут только в конфиге
// (правило проекта №3), а не в коде бизнес-логики и не в разметке страниц.
// Деньги — целое число в копейках рубля (как Payment.amountCents в схеме):
// никогда не Decimal и не float. Фаза 1 платёжной стратегии — РФ, рубли
// (architecture/06-внешние-сервисы.md, журнал 2026-06-17).
//
// Цены согласованы с Артёмом 2026-06-19: 900 / 2000 / 3000 ₽/мес. Менять цены
// без явного решения нельзя (CLAUDE.md, «спроси разрешения»). Бизнес-источник —
// .business/products/pricing.md.

export type PlanCode = "basic" | "standard" | "max";

export type Plan = {
  code: PlanCode;
  title: string;
  amountKopecks: number; // цена за один период (месяц), в копейках рубля
  monthlyTournamentLimit: number; // сколько турниров в месяц включает тариф
};

const CURRENCY = "RUB";
const PERIOD_DAYS = 30; // длительность оплаченного периода подписки
const FREE_TOURNAMENT_LIMIT = 1; // первый турнир бесплатно (до оформления подписки)

// Порядок в массиве = порядок показа на странице тарифов.
const PLANS: Record<PlanCode, Plan> = {
  basic: { code: "basic", title: "Базовый", amountKopecks: 90_000, monthlyTournamentLimit: 30 },
  standard: { code: "standard", title: "Средний", amountKopecks: 200_000, monthlyTournamentLimit: 70 },
  max: { code: "max", title: "Максимальный", amountKopecks: 300_000, monthlyTournamentLimit: 120 },
};

const PLAN_ORDER: PlanCode[] = ["basic", "standard", "max"];

export function getPlans(): Plan[] {
  return PLAN_ORDER.map((code) => PLANS[code]);
}

// Тариф по коду. undefined — если код неизвестен (внешний вход не доверяем).
export function getPlan(code: string): Plan | undefined {
  return (PLANS as Record<string, Plan | undefined>)[code];
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

// Форматирование копеек в рублёвую строку для UI: 90000 → «900 ₽», 200050 → «2 000,50 ₽».
// Тонкая утилита показа — числа берутся из тарифов выше, здесь только вид.
export function formatRubles(amountKopecks: number): string {
  const rubles = amountKopecks / 100;
  const hasKopecks = amountKopecks % 100 !== 0;
  const formatted = rubles.toLocaleString("ru-RU", {
    minimumFractionDigits: hasKopecks ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${formatted} ₽`;
}

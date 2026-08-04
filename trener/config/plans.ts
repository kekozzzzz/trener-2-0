// Тарифы подписки — ЕДИНЫЙ источник правды (правило проекта №3: цены, лимиты тиров
// и имя модели живут только в конфиге/БД, никогда в бизнес-логике или в разметке
// страниц). Здесь сходятся ОБА аспекта тарифа:
//   • цена тарифа в ДОЛЛАРАХ — priceUsd (показываем в $; расходы на ИИ тоже в $, поэтому
//     цена в долларах держит маржу стабильной при любом курсе). При оплате доллары
//     пересчитываются в рубли по курсу ЦБ РФ (usdToKopecks + adapters/exchange-rate);
//     ЮKassa списывает рубли (Payment.amountCents — целое в копейках рубля).
//   • лимит РАЗБОРОВ — tournamentLimit (число турниров, которые можно разобрать за период).
//
// tournamentLimit — сколько турниров игрок может РАЗОБРАТЬ (открыть ИИ-разбор) за период
// подписки. Модель «ленивый разбор»: загрузка и метрики парсера бесплатны и безлимитны,
// в счёт идёт только запуск разбора турнира (клик «Разобрать»). Честное видимое число на
// витрине (а не скрытый бюджет): тарифы отличаются для игрока ценой И числом разборов.
// Действия ВНУТРИ уже открытого турнира (диалог, чат) лимит не тратят — он уже посчитан.
//
// Цены и лимиты согласованы с Артёмом 2026-07-10 (показ в $, оплата в ₽ по курсу ЦБ),
// план plans/2026-07-10-новые-тарифы.md:
//   Базовый      $7  → 25 турниров (порог чувствуется активным игроком — стимул апгрейда)
//   Продвинутый  $28 → «без ограничений» на витрине; внутри fair-use 300/мес — защита от
//                      скриптов, живой человек столько физически не разбирает.
//                      Цена поднята с $21 до $28 по решению Артёма 2026-07-19 (ровно 7×4).
//   Максимальный $45 → СКРЫТ с витрины (hidden): продавал только объём, который никому не
//                      нужен. Код тарифа жив ради существующих подписок (comp владельца,
//                      тестер) — гейт и вебхук обязаны его понимать. Вернём с про-фичами.
// Прежняя сетка (2026-06-28): $9/50, $20/250, $45/500. Действующие basic-подписчики со
// старым лимитом дожинают оплаченный период на 50 — см. getEffectiveTournamentLimit.
// Менять цены/лимиты без явного решения нельзя (CLAUDE.md, «спроси разрешения»).

// Коды тарифов — то, что хранится в Subscription.planCode и приходит в metadata
// платежа. Не менять без миграции существующих подписок (под них завязан гейт бюджета).
export type PlanCode = "basic" | "standard" | "max";

export type Plan = {
  code: PlanCode;
  title: string;
  description: string; // одна строка под заголовком тарифа на странице цен
  priceUsd: number; // цена за период (месяц) в долларах — показ и база пересчёта в ₽
  tournamentLimit: number; // сколько турниров можно РАЗОБРАТЬ за период — гейт и витрина
  // Витрина показывает «без ограничений» вместо числа; tournamentLimit при этом остаётся
  // невидимым fair-use предохранителем гейта (от скриптов, не от людей).
  unlimited?: boolean;
  // Тариф скрыт со страницы цен (getPlans его не отдаёт), но код обязан его понимать:
  // существующие подписки с этим planCode продолжают работать через getPlan/гейт.
  hidden?: boolean;
};

const CURRENCY = "RUB";
const PERIOD_DAYS = 30; // длительность оплаченного периода подписки
// Бесплатных турниров (до оформления подписки) — 1. Было временно поднято до 3 на
// период тестирования (запрос Артёма 24.07.2026), возвращено обратно 04.08.2026.
const FREE_TOURNAMENT_LIMIT = 1;

// Порядок в массиве = порядок показа на странице тарифов.
const PLANS: Record<PlanCode, Plan> = {
  basic: {
    code: "basic",
    title: "Базовый",
    description: "Если разбираешь главные турниры недели",
    priceUsd: 7,
    tournamentLimit: 25,
  },
  standard: {
    code: "standard",
    title: "Продвинутый",
    description: "Если играешь и разбираешь регулярно",
    priceUsd: 28,
    tournamentLimit: 300, // невидимый fair-use (unlimited) — не витрина, а предохранитель
    unlimited: true,
  },
  max: {
    code: "max",
    title: "Максимальный",
    description: "Если играешь помногу и хочешь разбирать всё",
    priceUsd: 45,
    tournamentLimit: 500,
    hidden: true, // убран с витрины 2026-07-10; подписки с этим кодом продолжают работать
  },
};

const PLAN_ORDER: PlanCode[] = ["basic", "standard", "max"];

export const PLANS_LIST: readonly Plan[] = PLAN_ORDER.map((code) => PLANS[code]);

// Тарифы для витрины (страница цен, лендинг): скрытые не показываем.
export function getPlans(): Plan[] {
  return PLAN_ORDER.map((code) => PLANS[code]).filter((p) => !p.hidden);
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

// За сколько дней до конца оплаченного периода слать напоминание о скором
// списании/истечении. Бизнес-конфиг (правило 3) — переопределяемо из .env.
const RENEWAL_REMINDER_LEAD_DAYS = 3;
export function getRenewalReminderLeadDays(): number {
  const fromEnv = Number(process.env.RENEWAL_REMINDER_LEAD_DAYS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : RENEWAL_REMINDER_LEAD_DAYS;
}

export function getFreeTournamentLimit(): number {
  return FREE_TOURNAMENT_LIMIT;
}

// Лимит разборов (турниров за период) тарифа для гейта. null — неизвестный план.
export function getPlanTournamentLimit(code: string | null | undefined): number | null {
  return getPlan(code)?.tournamentLimit ?? null;
}

// Смена сетки 2026-07-10: basic сжался 50 → 25. Кто оплатил период по старым условиям —
// дожинает его на старом лимите (не отнимаем купленное: критическая поломка №1). Новый
// период (начался после смены) — уже по новым условиям.
const LEGACY_BASIC_LIMIT = 50;
const PRICING_CUTOVER_2026_07_10 = new Date("2026-07-11T00:00:00.000Z");

// Лимит с учётом legacy-условий: periodStart — начало ТЕКУЩЕГО оплаченного периода
// подписки (после ленивого переката). null — неизвестный план (гейт пропустит защитно).
export function getEffectiveTournamentLimit(
  code: string | null | undefined,
  periodStart: Date,
): number | null {
  const plan = getPlan(code);
  if (!plan) return null;
  if (plan.code === "basic" && periodStart < PRICING_CUTOVER_2026_07_10) {
    return Math.max(plan.tournamentLimit, LEGACY_BASIC_LIMIT);
  }
  return plan.tournamentLimit;
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

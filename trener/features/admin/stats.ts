// Сводная статистика продукта для вкладки владельца /admin.
// Все числа — продуктовые счётчики из БД (регистрации, входы, подписки, деньги,
// загрузки, активность, очередь); покерных метрик здесь нет — Правило 1 не задето.
// Данные АДМИНСКИЕ: собирать и отдавать только после проверки isAdminEmail.
// plans/2026-07-02-админ-статистика.md

import type { PrismaClient } from "@prisma/client";
import { getAdminTzOffsetHours, getExcludedTestPlayerIds, getAdminEmails } from "@/config/admin";
import { buildCostReport, type CostReport } from "@/features/usage/cost-report";
import { ACQUISITION_SOURCES } from "@/config/acquisition-sources";
import { getAppBaseUrl } from "@/config/app";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// ─────────────────────────── Границы суток ───────────────────────────────────
// Сутки режем по поясу владельца (МСК по умолчанию), а не по UTC сервера — иначе
// «сегодня» начиналось бы в 03:00 по Москве. Чистая арифметика, тестируется.

// Начало дня daysBack дней назад (0 — сегодня) по поясу tzOffsetHours, в UTC.
export function dayStartUtc(now: Date, tzOffsetHours: number, daysBack: number): Date {
  const shifted = now.getTime() + tzOffsetHours * HOUR_MS;
  const floorDay = Math.floor(shifted / DAY_MS) * DAY_MS;
  return new Date(floorDay - tzOffsetHours * HOUR_MS - daysBack * DAY_MS);
}

// Порядковый номер суток события по поясу владельца — для группировки графика.
function dayIndex(d: Date, tzOffsetHours: number): number {
  return Math.floor((d.getTime() + tzOffsetHours * HOUR_MS) / DAY_MS);
}

// Подпись дня «02.07» по поясу владельца.
function dayLabel(startUtc: Date, tzOffsetHours: number): string {
  const shifted = new Date(startUtc.getTime() + tzOffsetHours * HOUR_MS);
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}`;
}

// ─────────────────────────── Типы сводки ─────────────────────────────────────

export type PeriodCounts = {
  today: number;
  yesterday: number;
  last7: number;
  last30: number;
  total: number;
};

export type DayPoint = { label: string; count: number };

export type CountryCount = { country: string | null; count: number };

export type AdminStats = {
  generatedAt: Date;
  players: {
    registrations: PeriodCounts;
    registrationsByDay: DayPoint[]; // последние 14 дней
    open: number; // живые аккаунты
    closed: number; // закрытые (анонимизированные)
  };
  logins: {
    counts: PeriodCounts; // успешные входы (пароль + ссылка)
    uniquePlayers30: number; // сколько разных людей входило за 30 дней
    byDay: DayPoint[]; // последние 14 дней
    failed30: number; // неудачные попытки за 30 дней
  };
  siteVisits: PeriodCounts; // ЛЮБОЙ заход на сайт (не только вход в аккаунт), см. SiteVisit
  countries: {
    logins30: CountryCount[]; // топ стран по входам за 30 дней
    registrations30: CountryCount[]; // топ стран по регистрациям за 30 дней
  };
  trial: {
    triedFree: number; // игроков с хотя бы одним готовым разбором
    converted: number; // из них хоть раз платили
    notPaying: number; // попробовали и пока не платят
  };
  subscriptions: {
    activeByPlan: { planCode: string; count: number }[];
    new30: number;
    canceled30: number; // перешли в CANCELED за 30 дней (по updatedAt — приближение)
  };
  money: {
    currency: string;
    today: number; // в основных единицах (руб/долл), успешные платежи
    last7: number;
    last30: number;
    payments30: number; // число успешных платежей за 30 дней
    refunds30: number; // сумма возвратов за 30 дней
  }[];
  tournaments: {
    uploads: PeriodCounts;
    failed30: number; // не разобрались (status FAILED)
    unrecognized30: number; // файлы неизвестного формата
  };
  activity: {
    dialogueAnswers30: number; // отвеченные раунды диалога за 30 дней (по updatedAt)
    chatMessages: { today: number; last30: number }; // сообщения игроков в чате
  };
  llm: { day: CostReport; month: CostReport };
  queue: { pending: number; processing: number; poisoned: number; failed: number };
  acquisition: AcquisitionSourceStats[];
  surveys: SurveyResponseRow[];
};

// Ответ опроса «мы только в начале пути» (план 2026-07-29) — последние N штук,
// самые свежие первыми, для показа владельцу как есть (без агрегации: ответов
// пока мало, а качественный текст важнее сводных чисел).
export type SurveyResponseRow = {
  id: string;
  createdAt: Date;
  playerLabel: string;
  usefulnessRating: number;
  toneRating: number;
  questionsRating: number;
  recommendRating: number;
  pmfReaction: string | null; // "VERY_DISAPPOINTED"|"SOMEWHAT_DISAPPOINTED"|"NOT_DISAPPOINTED"|null (null — ответы до ревизии 2026-08-05)
  unclearText: string | null;
  styleChangeText: string | null;
  moreDetailText: string | null; // legacy-поле, не пишется с ревизии 2026-08-05
  likedText: string | null;
  missingText: string | null; // legacy-поле, не пишется с ревизии 2026-08-05
  freeformText: string | null;
};

export type AcquisitionSourceStats = {
  slug: string;
  label: string;
  link: string;
  visits: PeriodCounts;
  registrations: PeriodCounts;
};

// ─────────────────────────── Помощники агрегации ─────────────────────────────

function countSince(dates: Date[], since: Date, before?: Date): number {
  const from = since.getTime();
  const to = before?.getTime() ?? Infinity;
  let n = 0;
  for (const d of dates) {
    const t = d.getTime();
    if (t >= from && t < to) n += 1;
  }
  return n;
}

// Ряд «последние N дней» с нулями по дням без событий.
function dailySeries(dates: Date[], days: number, now: Date, tz: number): DayPoint[] {
  const byIndex = new Map<number, number>();
  for (const d of dates) {
    const idx = dayIndex(d, tz);
    byIndex.set(idx, (byIndex.get(idx) ?? 0) + 1);
  }
  const points: DayPoint[] = [];
  for (let back = days - 1; back >= 0; back -= 1) {
    const start = dayStartUtc(now, tz, back);
    points.push({ label: dayLabel(start, tz), count: byIndex.get(dayIndex(start, tz)) ?? 0 });
  }
  return points;
}

// Топ стран по убыванию; null (не определили) — в конец.
function topCountries(countries: (string | null)[], topN = 12): CountryCount[] {
  const byCountry = new Map<string | null, number>();
  for (const c of countries) byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
  return [...byCountry.entries()]
    .map(([country, count]) => ({ country, count }))
    .sort((a, b) => (a.country === null ? 1 : b.country === null ? -1 : b.count - a.count))
    .slice(0, topN);
}

// ─────────────────────────── Сборка сводки ───────────────────────────────────

export async function buildAdminStats(db: PrismaClient, now = new Date()): Promise<AdminStats> {
  const tz = getAdminTzOffsetHours();
  // Свои тестовые аккаунты (оплата и т.п.) не должны искажать воронку/регистрации/деньги.
  const excludedIds = getExcludedTestPlayerIds();
  const notTestPlayer = { notIn: excludedIds };

  // Собственные входы владельца (проверка сайта) не должны раздувать «Входы» —
  // тот же принцип, что и у notTestPlayer выше, но список считается по email,
  // не хардкодится: владелец может входить с разных Player-записей со временем.
  const adminPlayers = await db.player.findMany({
    where: { email: { in: getAdminEmails() } },
    select: { id: true },
  });
  const adminIds = new Set(adminPlayers.map((p) => p.id));
  const notAdminOrTestPlayer = { notIn: [...excludedIds, ...adminIds] };
  const t0 = dayStartUtc(now, tz, 0); // начало сегодня
  const t1 = dayStartUtc(now, tz, 1); // начало вчера
  const t7 = dayStartUtc(now, tz, 6); // «за 7 дней» = 7 календарных суток с сегодняшними
  const t30 = dayStartUtc(now, tz, 29);

  const successKinds = ["LOGIN_PASSWORD", "LOGIN_MAGIC"] as const;

  const [
    regDates30,
    playersTotal,
    playersClosed,
    authEvents30,
    loginsTotal,
    failed30,
    siteVisitDates30,
    siteVisitsTotal,
    readyTournamentPlayers,
    payerSubs,
    activeByPlanRaw,
    subsNew30,
    subsCanceled30,
    payments30,
    tournamentDates30,
    tournamentsTotal,
    tournamentsFailed30,
    unrecognized30,
    dialogueAnswers30,
    chatToday,
    chat30,
    queueRaw,
    llmDay,
    llmMonth,
    visitsTotalRaw,
    visitDates30Raw,
    registrationsTotalRaw,
    surveysRaw,
  ] = await Promise.all([
    db.player.findMany({
      where: { createdAt: { gte: t30 }, id: notTestPlayer },
      select: { createdAt: true },
    }),
    db.player.count({ where: { id: notTestPlayer } }),
    db.player.count({ where: { closedAt: { not: null }, id: notTestPlayer } }),
    db.authEvent.findMany({
      where: { createdAt: { gte: t30 } },
      select: { kind: true, playerId: true, country: true, createdAt: true, utmSource: true },
    }),
    db.authEvent.count({
      where: { kind: { in: [...successKinds] }, playerId: notAdminOrTestPlayer },
    }),
    db.authEvent.count({ where: { kind: "LOGIN_FAILED", createdAt: { gte: t30 } } }),
    db.siteVisit.findMany({ where: { createdAt: { gte: t30 } }, select: { createdAt: true } }),
    db.siteVisit.count(),
    db.tournament.findMany({
      where: {
        deletedAt: null,
        analysisUnlocked: true,
        status: "CARD_READY",
        playerId: notTestPlayer,
      },
      select: { playerId: true },
      distinct: ["playerId"],
    }),
    db.subscription.findMany({
      where: { payments: { some: { status: "SUCCEEDED" } }, playerId: notTestPlayer },
      select: { playerId: true },
    }),
    db.subscription.groupBy({
      by: ["planCode"],
      where: {
        status: "ACTIVE",
        deletedAt: null,
        OR: [{ nextPaymentAt: null }, { nextPaymentAt: { gt: now } }],
        playerId: notTestPlayer,
      },
      _count: { _all: true },
    }),
    db.subscription.count({ where: { createdAt: { gte: t30 }, playerId: notTestPlayer } }),
    db.subscription.count({
      where: { status: "CANCELED", updatedAt: { gte: t30 }, playerId: notTestPlayer },
    }),
    db.payment.findMany({
      where: { occurredAt: { gte: t30 }, subscription: { playerId: notTestPlayer } },
      select: { amountCents: true, currency: true, status: true, occurredAt: true },
    }),
    db.tournament.findMany({
      where: { createdAt: { gte: t30 }, playerId: notTestPlayer },
      select: { createdAt: true },
    }),
    db.tournament.count({ where: { playerId: notTestPlayer } }),
    db.tournament.count({ where: { status: "FAILED", createdAt: { gte: t30 } } }),
    db.unrecognizedUpload.count({ where: { createdAt: { gte: t30 } } }),
    db.dialogueRound.count({ where: { answer: { not: null }, updatedAt: { gte: t30 } } }),
    db.chatMessage.count({ where: { author: "PLAYER", createdAt: { gte: t0 } } }),
    db.chatMessage.count({ where: { author: "PLAYER", createdAt: { gte: t30 } } }),
    db.task.groupBy({ by: ["status"], _count: { _all: true } }),
    buildCostReport(db, 24),
    buildCostReport(db, 24 * 30),
    db.landingVisit.groupBy({ by: ["source"], _count: { _all: true } }),
    db.landingVisit.findMany({ where: { createdAt: { gte: t30 } }, select: { source: true, createdAt: true } }),
    db.authEvent.groupBy({ by: ["utmSource"], where: { kind: "REGISTER" }, _count: { _all: true } }),
    db.introSurveyResponse.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        createdAt: true,
        usefulnessRating: true,
        toneRating: true,
        questionsRating: true,
        recommendRating: true,
        pmfReaction: true,
        unclearText: true,
        styleChangeText: true,
        moreDetailText: true,
        likedText: true,
        missingText: true,
        freeformText: true,
        player: { select: { email: true, nickname: true } },
      },
    }),
  ]);

  // Регистрации: счётчики по датам создания игроков (история полная, в отличие
  // от журнала auth_events, который заполняется только с момента этой фичи).
  const regDates = regDates30.map((r) => r.createdAt);
  const registrations: PeriodCounts = {
    today: countSince(regDates, t0),
    yesterday: countSince(regDates, t1, t0),
    last7: countSince(regDates, t7),
    last30: regDates.length,
    total: playersTotal,
  };

  // Входы: успешные события журнала (пароль + волшебная ссылка), без своих
  // тестовых/владельческих аккаунтов — фильтр в JS, а не в самом запросе:
  // playerId у AuthEvent нулевой для неудачных попыток по чужому email, и
  // notIn на нулевом поле в SQL молча роняет такие строки из выборки.
  const isExcludedPlayer = (playerId: string | null) =>
    playerId !== null && (excludedIds.includes(playerId) || adminIds.has(playerId));
  const loginEvents = authEvents30.filter(
    (e) => (successKinds as readonly string[]).includes(e.kind) && !isExcludedPlayer(e.playerId),
  );
  const registerEvents = authEvents30.filter(
    (e) => e.kind === "REGISTER" && !isExcludedPlayer(e.playerId),
  );
  const loginDates = loginEvents.map((e) => e.createdAt);
  const logins: AdminStats["logins"] = {
    counts: {
      today: countSince(loginDates, t0),
      yesterday: countSince(loginDates, t1, t0),
      last7: countSince(loginDates, t7),
      last30: loginDates.length,
      total: loginsTotal,
    },
    uniquePlayers30: new Set(loginEvents.map((e) => e.playerId).filter(Boolean)).size,
    byDay: dailySeries(loginDates, 14, now, tz),
    failed30,
  };

  // Заходы на сайт вообще (маячок SiteVisitTracker): в отличие от «Входов» это
  // считает любое посещение, а не только событие входа в аккаунт.
  const siteVisitDates = siteVisitDates30.map((v) => v.createdAt);
  const siteVisits: PeriodCounts = {
    today: countSince(siteVisitDates, t0),
    yesterday: countSince(siteVisitDates, t1, t0),
    last7: countSince(siteVisitDates, t7),
    last30: siteVisitDates.length,
    total: siteVisitsTotal,
  };

  const tried = new Set(readyTournamentPlayers.map((t) => t.playerId));
  const payers = new Set(payerSubs.map((s) => s.playerId));
  const converted = [...tried].filter((id) => payers.has(id)).length;

  // Деньги: по валютам, суммы в основных единицах (в БД — целые копейки/центы).
  const currencies = [...new Set(payments30.map((p) => p.currency))].sort();
  const money = currencies.map((currency) => {
    const rows = payments30.filter((p) => p.currency === currency);
    const sumSince = (since: Date, status: "SUCCEEDED" | "REFUNDED") =>
      rows
        .filter((p) => p.status === status && p.occurredAt >= since)
        .reduce((acc, p) => acc + p.amountCents, 0) / 100;
    return {
      currency,
      today: sumSince(t0, "SUCCEEDED"),
      last7: sumSince(t7, "SUCCEEDED"),
      last30: sumSince(t30, "SUCCEEDED"),
      payments30: rows.filter((p) => p.status === "SUCCEEDED").length,
      refunds30: sumSince(t30, "REFUNDED"),
    };
  });

  const tournamentDates = tournamentDates30.map((t) => t.createdAt);

  const queueCount = (status: "PENDING" | "PROCESSING" | "POISONED" | "FAILED") =>
    queueRaw.find((q) => q.status === status)?._count._all ?? 0;

  // Источники переходов: по каждому источнику из конфига — заходы и регистрации,
  // тем же разрезом (сегодня/вчера/7 дней/30 дней/всего), что и остальные метрики
  // сводки (PeriodRow в UI). Источник без единого захода/регистрации просто нулевой,
  // не пропадает из списка (Артём должен видеть ссылку и её "0", а не пустоту).
  const visitTotal = (rows: { source: string; _count: { _all: number } }[], slug: string) =>
    rows.find((r) => r.source === slug)?._count._all ?? 0;
  const registrationTotal = (
    rows: { utmSource: string | null; _count: { _all: number } }[],
    slug: string,
  ) => rows.find((r) => r.utmSource === slug)?._count._all ?? 0;

  const visitDatesBySlug = new Map<string, Date[]>();
  for (const v of visitDates30Raw) {
    (visitDatesBySlug.get(v.source) ?? visitDatesBySlug.set(v.source, []).get(v.source)!).push(
      v.createdAt,
    );
  }
  // Неотфильтрованные (без исключения владельца/тестовых) — та же семантика,
  // что у registrationsTotalRaw ниже, чтобы «за 30 дней» и «всего» не расходились.
  const registerEventsAllBySlug = new Map<string, Date[]>();
  for (const e of authEvents30) {
    if (e.kind !== "REGISTER" || !e.utmSource) continue;
    (
      registerEventsAllBySlug.get(e.utmSource) ??
      registerEventsAllBySlug.set(e.utmSource, []).get(e.utmSource)!
    ).push(e.createdAt);
  }

  const periodFor = (dates: Date[], total: number): PeriodCounts => ({
    today: countSince(dates, t0),
    yesterday: countSince(dates, t1, t0),
    last7: countSince(dates, t7),
    last30: dates.length,
    total,
  });

  const baseUrl = getAppBaseUrl();
  const acquisition: AcquisitionSourceStats[] = ACQUISITION_SOURCES.map((s) => ({
    slug: s.slug,
    label: s.label,
    link: `${baseUrl}/go/${s.code}`,
    visits: periodFor(visitDatesBySlug.get(s.slug) ?? [], visitTotal(visitsTotalRaw, s.slug)),
    registrations: periodFor(
      registerEventsAllBySlug.get(s.slug) ?? [],
      registrationTotal(registrationsTotalRaw, s.slug),
    ),
  }));

  const surveys: SurveyResponseRow[] = surveysRaw.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    playerLabel: r.player?.nickname ?? r.player?.email ?? "—",
    usefulnessRating: r.usefulnessRating,
    toneRating: r.toneRating,
    questionsRating: r.questionsRating,
    recommendRating: r.recommendRating,
    pmfReaction: r.pmfReaction,
    unclearText: r.unclearText,
    styleChangeText: r.styleChangeText,
    moreDetailText: r.moreDetailText,
    likedText: r.likedText,
    missingText: r.missingText,
    freeformText: r.freeformText,
  }));

  return {
    generatedAt: now,
    players: {
      registrations,
      registrationsByDay: dailySeries(regDates, 14, now, tz),
      open: playersTotal - playersClosed,
      closed: playersClosed,
    },
    logins,
    siteVisits,
    countries: {
      logins30: topCountries(loginEvents.map((e) => e.country)),
      registrations30: topCountries(registerEvents.map((e) => e.country)),
    },
    trial: {
      triedFree: tried.size,
      converted,
      notPaying: tried.size - converted,
    },
    subscriptions: {
      activeByPlan: activeByPlanRaw
        .map((r) => ({ planCode: r.planCode, count: r._count._all }))
        .sort((a, b) => b.count - a.count),
      new30: subsNew30,
      canceled30: subsCanceled30,
    },
    money,
    tournaments: {
      uploads: {
        today: countSince(tournamentDates, t0),
        yesterday: countSince(tournamentDates, t1, t0),
        last7: countSince(tournamentDates, t7),
        last30: tournamentDates.length,
        total: tournamentsTotal,
      },
      failed30: tournamentsFailed30,
      unrecognized30,
    },
    activity: {
      dialogueAnswers30,
      chatMessages: { today: chatToday, last30: chat30 },
    },
    llm: { day: llmDay, month: llmMonth },
    queue: {
      pending: queueCount("PENDING"),
      processing: queueCount("PROCESSING"),
      poisoned: queueCount("POISONED"),
      failed: queueCount("FAILED"),
    },
    acquisition,
    surveys,
  };
}

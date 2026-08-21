/**
 * Тесты админ-статистики (features/admin/stats.ts).
 *
 * 1. dayStartUtc: границы «сегодня/вчера» режутся по поясу владельца (МСК +3),
 *    включая ночной случай (01:30 МСК — это ещё «вчера» по UTC).
 * 2. buildAdminStats: счётчики регистраций по периодам, входы, уникальные игроки
 *    и топ стран считаются из данных корректно (БД замокана литералом).
 */

import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { buildAdminStats, dayStartUtc } from "@/features/admin/stats";

const HOUR = 3_600_000;
const DAY = 86_400_000;

describe("dayStartUtc", () => {
  it("вечер по UTC — день по МСК уже следующий не наступил: начало дня в 21:00 UTC", () => {
    const now = new Date("2026-07-02T22:30:00Z"); // 01:30 МСК 3 июля
    expect(dayStartUtc(now, 3, 0).toISOString()).toBe("2026-07-02T21:00:00.000Z");
  });

  it("ночь по МСК (01:30) — «сегодня» началось вчера в 21:00 UTC", () => {
    const now = new Date("2026-07-01T22:30:00Z"); // 01:30 МСК 2 июля
    expect(dayStartUtc(now, 3, 0).toISOString()).toBe("2026-07-01T21:00:00.000Z");
  });

  it("daysBack отступает на целые сутки", () => {
    const now = new Date("2026-07-02T12:00:00Z");
    const t0 = dayStartUtc(now, 3, 0).getTime();
    expect(dayStartUtc(now, 3, 1).getTime()).toBe(t0 - DAY);
    expect(dayStartUtc(now, 3, 29).getTime()).toBe(t0 - 29 * DAY);
  });

  it("нулевой пояс — граница по UTC-полуночи", () => {
    const now = new Date("2026-07-02T00:10:00Z");
    expect(dayStartUtc(now, 0, 0).toISOString()).toBe("2026-07-02T00:00:00.000Z");
  });
});

// ─────────────────────────── buildAdminStats на моке ─────────────────────────

const NOW = new Date("2026-07-02T12:00:00Z"); // 15:00 МСК; t0 = 01T21:00Z
const T0 = new Date("2026-07-01T21:00:00.000Z").getTime();

type AuthEventRow = {
  kind: string;
  playerId: string | null;
  country: string | null;
  createdAt: Date;
  utmSource?: string | null;
};

function mockDb(opts: {
  playerDates: Date[];
  authEvents: AuthEventRow[];
  landingVisits?: { source: string; createdAt: Date }[];
}): PrismaClient {
  const landingVisits = opts.landingVisits ?? [];
  return {
    player: {
      findMany: async () => opts.playerDates.map((d) => ({ createdAt: d })),
      count: async (args?: { where?: { closedAt?: unknown } }) =>
        args?.where?.closedAt ? 0 : opts.playerDates.length,
    },
    authEvent: {
      findMany: async () => opts.authEvents,
      count: async (args: { where: { kind: unknown } }) => {
        const kind = args.where.kind as { in?: string[] } | string;
        if (typeof kind === "object" && kind.in) {
          return opts.authEvents.filter((e) => kind.in!.includes(e.kind)).length;
        }
        return opts.authEvents.filter((e) => e.kind === kind).length;
      },
      groupBy: async (args: { where?: { kind?: string } }) => {
        const rows = args.where?.kind
          ? opts.authEvents.filter((e) => e.kind === args.where!.kind)
          : opts.authEvents;
        const bySource = new Map<string, number>();
        for (const e of rows) {
          if (!e.utmSource) continue;
          bySource.set(e.utmSource, (bySource.get(e.utmSource) ?? 0) + 1);
        }
        return [...bySource.entries()].map(([utmSource, n]) => ({
          utmSource,
          _count: { _all: n },
        }));
      },
    },
    landingVisit: {
      groupBy: async () => {
        const bySource = new Map<string, number>();
        for (const v of landingVisits) bySource.set(v.source, (bySource.get(v.source) ?? 0) + 1);
        return [...bySource.entries()].map(([source, n]) => ({ source, _count: { _all: n } }));
      },
      findMany: async () => landingVisits,
    },
    siteVisit: { findMany: async () => [], count: async () => 0 },
    tournament: {
      findMany: async (args: { distinct?: unknown }) => (args.distinct ? [] : []),
      count: async () => 0,
    },
    subscription: { findMany: async () => [], groupBy: async () => [], count: async () => 0 },
    payment: { findMany: async () => [] },
    unrecognizedUpload: { count: async () => 0 },
    dialogueRound: { count: async () => 0 },
    chatMessage: { count: async () => 0 },
    task: { groupBy: async () => [] },
    llmUsage: { findMany: async () => [] },
    introSurveyResponse: { findMany: async () => [] },
  } as unknown as PrismaClient;
}

describe("buildAdminStats", () => {
  it("режет регистрации по периодам и считает входы, уники и страны", async () => {
    const db = mockDb({
      // 2 сегодня, 1 вчера, 1 три дня назад
      playerDates: [
        new Date(T0 + 2 * HOUR),
        new Date(T0 + 5 * HOUR),
        new Date(T0 - 3 * HOUR),
        new Date(T0 - 2 * DAY),
      ],
      authEvents: [
        { kind: "LOGIN_PASSWORD", playerId: "p1", country: "RU", createdAt: new Date(T0 + HOUR) },
        { kind: "LOGIN_MAGIC", playerId: "p1", country: "RU", createdAt: new Date(T0 - HOUR) },
        { kind: "LOGIN_PASSWORD", playerId: "p2", country: "US", createdAt: new Date(T0 - 2 * DAY) },
        { kind: "REGISTER", playerId: "p3", country: "KZ", createdAt: new Date(T0 + HOUR) },
        { kind: "LOGIN_FAILED", playerId: null, country: null, createdAt: new Date(T0 + HOUR) },
      ],
    });

    const s = await buildAdminStats(db, NOW);

    expect(s.players.registrations).toEqual({
      today: 2,
      yesterday: 1,
      last7: 4,
      last30: 4,
      total: 4,
    });
    // График регистраций: 14 точек, последняя — «сегодня» с двумя событиями.
    expect(s.players.registrationsByDay).toHaveLength(14);
    expect(s.players.registrationsByDay[13].count).toBe(2);

    expect(s.logins.counts.today).toBe(1);
    expect(s.logins.counts.yesterday).toBe(1);
    expect(s.logins.counts.last30).toBe(3);
    expect(s.logins.uniquePlayers30).toBe(2); // p1 дважды + p2
    expect(s.logins.failed30).toBe(1);

    expect(s.countries.logins30).toEqual([
      { country: "RU", count: 2 },
      { country: "US", count: 1 },
    ]);
    expect(s.countries.registrations30).toEqual([{ country: "KZ", count: 1 }]);

    // Пустые источники не валят сборку: нули и пустые списки.
    expect(s.siteVisits).toEqual({ today: 0, yesterday: 0, last7: 0, last30: 0, total: 0 });
    expect(s.trial).toEqual({ triedFree: 0, converted: 0, notPaying: 0 });
    expect(s.money).toEqual([]);
    expect(s.queue).toEqual({ pending: 0, processing: 0, poisoned: 0, failed: 0 });

    // Источники переходов: список берётся из конфига, без единого захода — нули
    // по всем периодам, источник из списка не пропадает.
    expect(s.acquisition.map((a) => a.slug)).toContain("gipsyteam");
    const gipsyteam = s.acquisition.find((a) => a.slug === "gipsyteam")!;
    expect(gipsyteam.visits).toEqual({ today: 0, yesterday: 0, last7: 0, last30: 0, total: 0 });
    expect(gipsyteam.registrations).toEqual({ today: 0, yesterday: 0, last7: 0, last30: 0, total: 0 });
    // Ссылка строится по непрозрачному коду, а не по человекочитаемому slug
    // (человек не должен угадать источник по виду ссылки).
    expect(gipsyteam.link).not.toContain("gipsyteam");
    expect(gipsyteam.link).toMatch(/\/go\/\d{6}$/);
  });

  it("считает заходы/регистрации по источнику тем же разрезом день/неделя/30 дней/всего", async () => {
    const db = mockDb({
      playerDates: [],
      authEvents: [
        // 2 регистрации telegram сегодня, 1 вчера (входит в last7, не в today)
        { kind: "REGISTER", playerId: "p1", country: "RU", createdAt: new Date(T0 + HOUR), utmSource: "telegram" },
        { kind: "REGISTER", playerId: "p2", country: "RU", createdAt: new Date(T0 + 2 * HOUR), utmSource: "telegram" },
        { kind: "REGISTER", playerId: "p3", country: "RU", createdAt: new Date(T0 - 3 * HOUR), utmSource: "telegram" },
      ],
      landingVisits: [
        { source: "telegram", createdAt: new Date(T0 + HOUR) }, // сегодня
        { source: "telegram", createdAt: new Date(T0 - 2 * DAY) }, // last7, не today
      ],
    });

    const s = await buildAdminStats(db, NOW);
    const telegram = s.acquisition.find((a) => a.slug === "telegram")!;

    expect(telegram.visits).toEqual({ today: 1, yesterday: 0, last7: 2, last30: 2, total: 2 });
    expect(telegram.registrations).toEqual({ today: 2, yesterday: 1, last7: 3, last30: 3, total: 3 });
  });
});

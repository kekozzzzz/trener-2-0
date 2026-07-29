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
};

function mockDb(opts: { playerDates: Date[]; authEvents: AuthEventRow[] }): PrismaClient {
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
      groupBy: async () => [],
    },
    landingVisit: { groupBy: async () => [] },
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
    expect(s.trial).toEqual({ triedFree: 0, converted: 0, notPaying: 0 });
    expect(s.money).toEqual([]);
    expect(s.queue).toEqual({ pending: 0, processing: 0, poisoned: 0, failed: 0 });

    // Источники переходов: список берётся из конфига, без единого захода — нули,
    // источник из списка не пропадает.
    expect(s.acquisition.map((a) => a.slug)).toEqual(["gipsyteam", "telegram"]);
    expect(s.acquisition[0]).toMatchObject({
      slug: "gipsyteam",
      visitsTotal: 0,
      visits30: 0,
      registrationsTotal: 0,
      registrations30: 0,
    });
    // Ссылка строится по непрозрачному коду, а не по человекочитаемому slug
    // (человек не должен угадать источник по виду ссылки).
    expect(s.acquisition[0].link).not.toContain("gipsyteam");
    expect(s.acquisition[0].link).toMatch(/\/go\/\d{6}$/);
  });
});

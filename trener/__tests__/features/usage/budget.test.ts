import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { assessAiAccess, effectivePeriodStart } from "@/features/usage/budget";

const DAY_MS = 24 * 60 * 60 * 1000;

// ADMIN_EMAILS в тестах не задан → админ/владелец = DEFAULT_ADMIN_EMAILS (config/admin.ts).
const OWNER_EMAIL = "artemkekoz@gmail.com";

type Sub = {
  status: string;
  planCode: string;
  currentPeriodStart: Date;
  nextPaymentAt: Date | null;
  deletedAt: Date | null;
} | null;

function mockDb(opts: {
  email: string;
  subscription?: Sub;
  spentUsd?: number;
  firstTournamentId?: string | null;
}): PrismaClient {
  return {
    player: {
      findUnique: async () => ({ email: opts.email, subscription: opts.subscription ?? null }),
    },
    llmUsage: {
      aggregate: async () => ({ _sum: { costUsd: opts.spentUsd ?? 0 } }),
    },
    tournament: {
      findFirst: async () => (opts.firstTournamentId ? { id: opts.firstTournamentId } : null),
    },
  } as unknown as PrismaClient;
}

// Период относительно «сейчас»: метр считает с currentPeriodStart (5 дней назад,
// в пределах текущего периода), доступ активен (nextPaymentAt в будущем). Завязка на
// now делает тест устойчивым к дате прогона.
const activeSub = (planCode: string): Sub => {
  const now = Date.now();
  return {
    status: "ACTIVE",
    planCode,
    currentPeriodStart: new Date(now - 5 * DAY_MS),
    nextPaymentAt: new Date(now + 25 * DAY_MS),
    deletedAt: null,
  };
};

describe("assessAiAccess", () => {
  it("владелец — без лимита", async () => {
    const db = mockDb({ email: OWNER_EMAIL, firstTournamentId: "T1" });
    expect(await assessAiAccess(db, "p", { tournamentId: "T9" })).toEqual({ allowed: true });
  });

  it("активная подписка, бюджет не исчерпан → доступ", async () => {
    const db = mockDb({ email: "u@x.ru", subscription: activeSub("basic"), spentUsd: 1.0 });
    expect(await assessAiAccess(db, "p")).toEqual({ allowed: true });
  });

  it("активная подписка, бюджет исчерпан → стена LIMIT_REACHED", async () => {
    const db = mockDb({ email: "u@x.ru", subscription: activeSub("basic"), spentUsd: 5.0 }); // basic = $4.0
    const res = await assessAiAccess(db, "p");
    expect(res.allowed).toBe(false);
    if (res.allowed) return;
    expect(res.reason).toBe("LIMIT_REACHED");
  });

  it("статус ACTIVE, но оплаченный период истёк → не активна (paywall, как без подписки)", async () => {
    const now = Date.now();
    const expired: Sub = {
      status: "ACTIVE",
      planCode: "basic",
      currentPeriodStart: new Date(now - 40 * DAY_MS),
      nextPaymentAt: new Date(now - 10 * DAY_MS), // оплаченный период закончился
      deletedAt: null,
    };
    const db = mockDb({ email: "u@x.ru", subscription: expired, firstTournamentId: "T1" });
    const res = await assessAiAccess(db, "p");
    expect(res.allowed).toBe(false);
    if (res.allowed) return;
    expect(res.reason).toBe("PAYWALL");
  });

  it("без подписки, турниров ещё нет → первая загрузка бесплатна", async () => {
    const db = mockDb({ email: "u@x.ru", firstTournamentId: null });
    expect(await assessAiAccess(db, "p")).toEqual({ allowed: true });
  });

  it("без подписки, турнир уже есть, новая загрузка → PAYWALL", async () => {
    const db = mockDb({ email: "u@x.ru", firstTournamentId: "T1" });
    const res = await assessAiAccess(db, "p");
    expect(res.allowed).toBe(false);
    if (res.allowed) return;
    expect(res.reason).toBe("PAYWALL");
  });

  it("без подписки, диалог на ПЕРВОМ (бесплатном) турнире → доступ", async () => {
    const db = mockDb({ email: "u@x.ru", firstTournamentId: "T1" });
    expect(await assessAiAccess(db, "p", { tournamentId: "T1" })).toEqual({ allowed: true });
  });

  it("без подписки, действие на ДРУГОМ турнире → PAYWALL", async () => {
    const db = mockDb({ email: "u@x.ru", firstTournamentId: "T1" });
    const res = await assessAiAccess(db, "p", { tournamentId: "T2" });
    expect(res.allowed).toBe(false);
    if (res.allowed) return;
    expect(res.reason).toBe("PAYWALL");
  });
});

describe("effectivePeriodStart (ленивый перекат метра)", () => {
  const start = new Date("2026-06-01T00:00:00.000Z");

  it("внутри первого периода — якорь не двигается", () => {
    const now = new Date("2026-06-20T00:00:00.000Z"); // прошло 19 дней
    expect(effectivePeriodStart(start, now, 30).getTime()).toBe(start.getTime());
  });

  it("на втором периоде (оплата вперёд / прошёл месяц) — якорь сдвинут на +30 дней", () => {
    const now = new Date("2026-07-10T00:00:00.000Z"); // прошло 39 дней → 2-й период
    expect(effectivePeriodStart(start, now, 30).getTime()).toBe(start.getTime() + 30 * DAY_MS);
  });

  it("на третьем периоде — якорь на +60 дней", () => {
    const now = new Date("2026-08-05T00:00:00.000Z"); // прошло 65 дней → 3-й период
    expect(effectivePeriodStart(start, now, 30).getTime()).toBe(start.getTime() + 60 * DAY_MS);
  });

  it("currentPeriodStart в будущем (защитно) — возвращаем как есть", () => {
    const now = new Date("2026-05-20T00:00:00.000Z");
    expect(effectivePeriodStart(start, now, 30).getTime()).toBe(start.getTime());
  });
});

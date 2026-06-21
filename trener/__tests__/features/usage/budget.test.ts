import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { assessAiAccess } from "@/features/usage/budget";

// ADMIN_EMAILS в тестах не задан → админ = OPERATOR.contactEmail (config/legal.ts).
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

const activeSub = (planCode: string): Sub => ({
  status: "ACTIVE",
  planCode,
  currentPeriodStart: new Date("2026-06-01"),
  nextPaymentAt: new Date("2026-07-01"),
  deletedAt: null,
});

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

/**
 * Тест подбора адресатов ручного бродкаста (features/email/feature-announcement.ts).
 * Бьёт в реальную тестовую базу (trener_test).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { findBroadcastRecipients } from "@/features/email/feature-announcement";

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

const PLAYER_WITH_EMAIL = "aaaaaaaa-4444-0000-0000-000000000001";
const PLAYER_CLOSED = "aaaaaaaa-4444-0000-0000-000000000002";

beforeAll(async () => {
  await prisma.player.upsert({
    where: { id: PLAYER_WITH_EMAIL },
    update: { email: "broadcast-a@trener.local", locale: "en" },
    create: { id: PLAYER_WITH_EMAIL, email: "broadcast-a@trener.local", locale: "en" },
  });
  await prisma.player.upsert({
    where: { id: PLAYER_CLOSED },
    update: { email: null, closedAt: new Date() },
    create: { id: PLAYER_CLOSED, email: null, closedAt: new Date() },
  });
});

afterAll(async () => {
  await prisma.player.deleteMany({ where: { id: { in: [PLAYER_WITH_EMAIL, PLAYER_CLOSED] } } });
  await prisma.$disconnect();
});

describe("findBroadcastRecipients", () => {
  it("включает живой аккаунт с email, исключает закрытый (email NULL)", async () => {
    const recipients = await findBroadcastRecipients(prisma);
    expect(recipients).toContainEqual({ email: "broadcast-a@trener.local", locale: "en" });
    expect(recipients.some((r) => r.email === null)).toBe(false);
  });
});

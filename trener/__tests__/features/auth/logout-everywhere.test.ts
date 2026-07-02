/**
 * Тесты logoutEverywhereAction (features/auth/actions.ts).
 *
 * Покрывают:
 *  1. Сдвигает sessionsValidFrom, чистит текущую куку и редиректит на /enter (вход по ссылке первичен).
 *  2. Ранее выданная сессия после этого не пускает (getCurrentPlayer → null).
 *
 * Бьёт в реальную тестовую базу (trener_test).
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const { cookieStore } = vi.hoisted(() => ({ cookieStore: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
  // getUserLocale (проводка языка в письма/Player) читает accept-language → отдаём ru.
  headers: async () => ({
    get: (name: string) => (name === "accept-language" ? "ru" : null),
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { prisma } from "@/infrastructure/db/client";
import { registerAction, logoutEverywhereAction, type AuthFormState } from "@/features/auth/actions";
import { getCurrentPlayer } from "@/features/auth/queries";

const initialState: AuthFormState = {};
const TEST_EMAIL = "test-logout-everywhere@trener.local";
const PASS = "somepass123";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(async () => {
  cookieStore.clear();
  await prisma.player.deleteMany({ where: { email: TEST_EMAIL } });
  await expect(
    registerAction(initialState, formData({ email: TEST_EMAIL, password: PASS, passwordConfirm: PASS, terms: "on" }))
  ).rejects.toThrow("REDIRECT:/");
});

afterAll(async () => {
  await prisma.player.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

describe("logoutEverywhereAction", () => {
  it("гасит все сессии, чистит куку и ведёт на /enter", async () => {
    const before = await prisma.player.findUnique({ where: { email: TEST_EMAIL } });
    const oldCookie = cookieStore.get("session")!;

    await expect(logoutEverywhereAction()).rejects.toThrow("REDIRECT:/enter");

    // Метка сессий сдвинулась, текущая кука удалена.
    const after = await prisma.player.findUnique({ where: { email: TEST_EMAIL } });
    expect(after!.sessionsValidFrom.getTime()).toBeGreaterThan(before!.sessionsValidFrom.getTime());
    expect(cookieStore.has("session")).toBe(false);

    // Возвращаем прежнюю куку — она больше не действительна.
    cookieStore.set("session", oldCookie);
    expect(await getCurrentPlayer()).toBeNull();
  });
});

/**
 * Тесты registerAction / loginAction (features/auth/actions.ts).
 *
 * Покрывают:
 *  1. registerAction: успех создаёт Player с хешем пароля, termsAcceptedAt и сессией.
 *  2. registerAction: занятый email → ошибка.
 *  3. registerAction: короткий пароль → ошибка.
 *  4. registerAction: пароли не совпадают → ошибка.
 *  5. registerAction: чекбокс согласия не отмечен → ошибка.
 *  6. loginAction: верные данные → сессия.
 *  7. loginAction: неверный пароль / несуществующий email → одна и та же ошибка.
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
import { registerAction, loginAction, type AuthFormState } from "@/features/auth/actions";
import { getSession } from "@/features/auth/session";

const initialState: AuthFormState = {};
const TEST_EMAIL = "test-auth-actions@trener.local";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(async () => {
  cookieStore.clear();
  await prisma.player.deleteMany({ where: { email: TEST_EMAIL } });
});

afterAll(async () => {
  await prisma.player.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

describe("registerAction", () => {
  it("успех создаёт Player с хешем пароля, termsAcceptedAt и сессией", async () => {
    const fd = formData({
      email: TEST_EMAIL,
      password: "password123",
      passwordConfirm: "password123",
      terms: "on",
    });

    await expect(registerAction(initialState, fd)).rejects.toThrow("REDIRECT:/");

    const player = await prisma.player.findUnique({ where: { email: TEST_EMAIL } });
    expect(player).not.toBeNull();
    expect(player!.passwordHash).not.toBe("password123");
    expect(player!.termsAcceptedAt).not.toBeNull();

    const session = await getSession();
    expect(session?.playerId).toBe(player!.id);
  });

  it("занятый email → ошибка", async () => {
    await prisma.player.create({
      data: { email: TEST_EMAIL, passwordHash: "x", termsAcceptedAt: new Date() },
    });

    const fd = formData({
      email: TEST_EMAIL,
      password: "password123",
      passwordConfirm: "password123",
      terms: "on",
    });

    const result = await registerAction(initialState, fd);
    expect(result).toEqual({ error: "Этот email уже зарегистрирован" });
  });

  it("короткий пароль → ошибка", async () => {
    const fd = formData({
      email: TEST_EMAIL,
      password: "short",
      passwordConfirm: "short",
      terms: "on",
    });

    const result = await registerAction(initialState, fd);
    expect(result.error).toBeTruthy();

    const player = await prisma.player.findUnique({ where: { email: TEST_EMAIL } });
    expect(player).toBeNull();
  });

  it("пароли не совпадают → ошибка", async () => {
    const fd = formData({
      email: TEST_EMAIL,
      password: "password123",
      passwordConfirm: "different123",
      terms: "on",
    });

    const result = await registerAction(initialState, fd);
    expect(result).toEqual({ error: "Пароли не совпадают" });
  });

  it("чекбокс согласия не отмечен → ошибка", async () => {
    const fd = formData({
      email: TEST_EMAIL,
      password: "password123",
      passwordConfirm: "password123",
    });

    const result = await registerAction(initialState, fd);
    expect(result.error).toBeTruthy();

    const player = await prisma.player.findUnique({ where: { email: TEST_EMAIL } });
    expect(player).toBeNull();
  });
});

describe("loginAction", () => {
  beforeEach(async () => {
    const fd = formData({
      email: TEST_EMAIL,
      password: "password123",
      passwordConfirm: "password123",
      terms: "on",
    });
    await expect(registerAction(initialState, fd)).rejects.toThrow("REDIRECT:/");
    cookieStore.clear();
  });

  it("верные данные → сессия", async () => {
    const fd = formData({ email: TEST_EMAIL, password: "password123" });

    await expect(loginAction(initialState, fd)).rejects.toThrow("REDIRECT:/");

    const player = await prisma.player.findUnique({ where: { email: TEST_EMAIL } });
    const session = await getSession();
    expect(session?.playerId).toBe(player!.id);
  });

  it("неверный пароль → общая ошибка", async () => {
    const fd = formData({ email: TEST_EMAIL, password: "wrongpassword" });

    const result = await loginAction(initialState, fd);
    expect(result).toEqual({ error: "Неверный email или пароль" });
    expect(await getSession()).toBeNull();
  });

  it("несуществующий email → та же ошибка", async () => {
    const fd = formData({ email: "no-such-user@trener.local", password: "password123" });

    const result = await loginAction(initialState, fd);
    expect(result).toEqual({ error: "Неверный email или пароль" });
  });
});

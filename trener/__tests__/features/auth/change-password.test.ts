/**
 * Тесты changePasswordAction (features/auth/actions.ts, [[2026-06-15-личный-кабинет]]).
 *
 * Покрывают:
 *  1. Успех: верный текущий → passwordHash меняется (новый проходит, старый нет), success.
 *  2. Неверный текущий пароль → ошибка, хеш не меняется.
 *  3. Короткий новый пароль → ошибка.
 *  4. Новые пароли не совпадают → ошибка.
 *  5. Новый совпадает с текущим → ошибка.
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
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { prisma } from "@/infrastructure/db/client";
import { registerAction, changePasswordAction, type AuthFormState } from "@/features/auth/actions";
import { verifyPassword } from "@/features/auth/password";

const initialState: AuthFormState = {};
const TEST_EMAIL = "test-change-password@trener.local";
const CURRENT = "currentpass123";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(async () => {
  cookieStore.clear();
  await prisma.player.deleteMany({ where: { email: TEST_EMAIL } });
  await expect(
    registerAction(initialState, formData({ email: TEST_EMAIL, password: CURRENT, passwordConfirm: CURRENT, terms: "on" }))
  ).rejects.toThrow("REDIRECT:/");
});

afterAll(async () => {
  await prisma.player.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

describe("changePasswordAction", () => {
  it("верный текущий → пароль меняется, success", async () => {
    const result = await changePasswordAction(
      initialState,
      formData({ currentPassword: CURRENT, newPassword: "brandnew456", newPasswordConfirm: "brandnew456" })
    );

    expect(result).toEqual({ success: true });

    const player = await prisma.player.findUnique({ where: { email: TEST_EMAIL } });
    expect(await verifyPassword("brandnew456", player!.passwordHash!)).toBe(true);
    expect(await verifyPassword(CURRENT, player!.passwordHash!)).toBe(false);
  });

  it("неверный текущий пароль → ошибка, хеш не меняется", async () => {
    const before = await prisma.player.findUnique({ where: { email: TEST_EMAIL } });

    const result = await changePasswordAction(
      initialState,
      formData({ currentPassword: "wrongcurrent", newPassword: "brandnew456", newPasswordConfirm: "brandnew456" })
    );

    expect(result).toEqual({ error: "Неверный текущий пароль" });
    const after = await prisma.player.findUnique({ where: { email: TEST_EMAIL } });
    expect(after!.passwordHash).toBe(before!.passwordHash);
  });

  it("короткий новый пароль → ошибка", async () => {
    const result = await changePasswordAction(
      initialState,
      formData({ currentPassword: CURRENT, newPassword: "short", newPasswordConfirm: "short" })
    );
    expect(result.error).toBeTruthy();
  });

  it("новые пароли не совпадают → ошибка", async () => {
    const result = await changePasswordAction(
      initialState,
      formData({ currentPassword: CURRENT, newPassword: "brandnew456", newPasswordConfirm: "different456" })
    );
    expect(result).toEqual({ error: "Новые пароли не совпадают" });
  });

  it("новый совпадает с текущим → ошибка", async () => {
    const result = await changePasswordAction(
      initialState,
      formData({ currentPassword: CURRENT, newPassword: CURRENT, newPasswordConfirm: CURRENT })
    );
    expect(result).toEqual({ error: "Новый пароль совпадает с текущим" });
  });
});

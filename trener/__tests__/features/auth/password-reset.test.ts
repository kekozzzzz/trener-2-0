/**
 * Тесты сброса пароля (requestPasswordResetAction / resetPasswordAction).
 *
 * Покрывают:
 *  1. Неизвестный email → success (не раскрываем), токен не создаётся, письмо не шлётся.
 *  2. Известный email → success, создаётся один токен, письмо со ссылкой отправлено.
 *  3. Повторный запрос гасит прежний неиспользованный токен.
 *  4. Валидный токен → пароль сменён (новый проходит, старый нет), токен использован,
 *     redirect /login?reset=1, и старая сессия (кука) больше не пускает.
 *  5. Истёкший / использованный / кривой токен → ошибка, пароль не меняется.
 *  6. Короткий или несовпадающий новый пароль → ошибка.
 *
 * email-адаптер замокан (ссылку с токеном перехватываем из письма). Реальная база (trener_test).
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

const { cookieStore, sentEmails } = vi.hoisted(() => ({
  cookieStore: new Map<string, string>(),
  sentEmails: [] as { to: string; subject: string; html: string; text: string }[],
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => void cookieStore.set(name, value),
    delete: (name: string) => void cookieStore.delete(name),
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

vi.mock("@/infrastructure/adapters/email", () => ({
  safeSendEmail: vi.fn(async (m) => void sentEmails.push(m)),
}));

import { prisma } from "@/infrastructure/db/client";
import {
  registerAction,
  requestPasswordResetAction,
  resetPasswordAction,
  type AuthFormState,
} from "@/features/auth/actions";
import { verifyPassword } from "@/features/auth/password";
import { getCurrentPlayer } from "@/features/auth/queries";

const initialState: AuthFormState = {};
const EMAIL = "test-reset@trener.local";
const ORIG = "origpass123";
const NEW = "brandnewpass456";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

function tokenFrom(text: string): string {
  const m = text.match(/token=([a-f0-9]+)/);
  if (!m) throw new Error("в письме нет токена");
  return m[1];
}

async function requestAndGetToken(): Promise<string> {
  sentEmails.length = 0;
  await requestPasswordResetAction(initialState, formData({ email: EMAIL }));
  expect(sentEmails).toHaveLength(1);
  return tokenFrom(sentEmails[0].text);
}

beforeEach(async () => {
  cookieStore.clear();
  sentEmails.length = 0;
  vi.clearAllMocks();
  await prisma.player.deleteMany({ where: { email: EMAIL } });
  await expect(
    registerAction(initialState, formData({ email: EMAIL, password: ORIG, passwordConfirm: ORIG, terms: "on" }))
  ).rejects.toThrow("REDIRECT:/");
  // Регистрация теперь шлёт приветственное письмо — очищаем буфер после неё,
  // чтобы тесты считали только письма сброса.
  sentEmails.length = 0;
});

afterAll(async () => {
  await prisma.player.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

describe("requestPasswordResetAction", () => {
  it("неизвестный email → success, токен не создан, письмо не отправлено", async () => {
    const result = await requestPasswordResetAction(initialState, formData({ email: "nobody@trener.local" }));
    expect(result).toEqual({ success: true });
    expect(sentEmails).toHaveLength(0);
  });

  it("известный email → success, один токен, письмо со ссылкой", async () => {
    const result = await requestPasswordResetAction(initialState, formData({ email: EMAIL }));
    expect(result).toEqual({ success: true });
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe(EMAIL);
    expect(sentEmails[0].text).toMatch(/reset-password\?token=[a-f0-9]{64}/);

    const player = await prisma.player.findUnique({ where: { email: EMAIL } });
    const tokens = await prisma.passwordResetToken.findMany({ where: { playerId: player!.id } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].usedAt).toBeNull();
  });

  it("повторный запрос гасит прежний неиспользованный токен", async () => {
    await requestPasswordResetAction(initialState, formData({ email: EMAIL }));
    await requestPasswordResetAction(initialState, formData({ email: EMAIL }));

    const player = await prisma.player.findUnique({ where: { email: EMAIL } });
    const tokens = await prisma.passwordResetToken.findMany({ where: { playerId: player!.id } });
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((t) => t.usedAt === null)).toHaveLength(1);
  });
});

describe("resetPasswordAction", () => {
  it("валидный токен → пароль сменён, токен использован, redirect, старая сессия мертва", async () => {
    const oldCookie = cookieStore.get("session")!;
    const token = await requestAndGetToken();

    await expect(
      resetPasswordAction(initialState, formData({ token, newPassword: NEW, newPasswordConfirm: NEW }))
    ).rejects.toThrow("REDIRECT:/login?reset=1");

    const player = await prisma.player.findUnique({ where: { email: EMAIL } });
    expect(await verifyPassword(NEW, player!.passwordHash!)).toBe(true);
    expect(await verifyPassword(ORIG, player!.passwordHash!)).toBe(false);

    const tokens = await prisma.passwordResetToken.findMany({ where: { playerId: player!.id } });
    expect(tokens.every((t) => t.usedAt !== null)).toBe(true);

    // Старая сессия (выдана до сброса) больше не действительна.
    cookieStore.set("session", oldCookie);
    expect(await getCurrentPlayer()).toBeNull();
  });

  it("истёкший токен → ошибка, пароль не меняется", async () => {
    const token = await requestAndGetToken();
    await prisma.passwordResetToken.updateMany({
      where: { usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await resetPasswordAction(initialState, formData({ token, newPassword: NEW, newPasswordConfirm: NEW }));
    expect(result.error).toMatch(/недействительна или устарела/);

    const player = await prisma.player.findUnique({ where: { email: EMAIL } });
    expect(await verifyPassword(ORIG, player!.passwordHash!)).toBe(true);
  });

  it("использованный токен второй раз → ошибка", async () => {
    const token = await requestAndGetToken();
    await expect(
      resetPasswordAction(initialState, formData({ token, newPassword: NEW, newPasswordConfirm: NEW }))
    ).rejects.toThrow("REDIRECT:");

    const result = await resetPasswordAction(initialState, formData({ token, newPassword: "another789", newPasswordConfirm: "another789" }));
    expect(result.error).toMatch(/недействительна или устарела/);
  });

  it("кривой токен → ошибка", async () => {
    const result = await resetPasswordAction(initialState, formData({ token: "deadbeef", newPassword: NEW, newPasswordConfirm: NEW }));
    expect(result.error).toMatch(/недействительна или устарела/);
  });

  it("несовпадающие пароли → ошибка", async () => {
    const token = await requestAndGetToken();
    const result = await resetPasswordAction(initialState, formData({ token, newPassword: NEW, newPasswordConfirm: "different999" }));
    expect(result).toEqual({ error: "Пароли не совпадают" });
  });

  it("короткий пароль → ошибка", async () => {
    const token = await requestAndGetToken();
    const result = await resetPasswordAction(initialState, formData({ token, newPassword: "short", newPasswordConfirm: "short" }));
    expect(result.error).toMatch(/не короче 8/);
  });
});

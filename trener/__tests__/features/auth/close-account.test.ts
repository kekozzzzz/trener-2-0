/**
 * Тесты закрытия аккаунта по ссылке (requestAccountClosureAction /
 * confirmAccountCloseAction). Закрытие подтверждается ссылкой из письма и кнопкой на
 * странице (не по клику). Работает для парольных и беспарольных аккаунтов одинаково.
 *
 * Покрывают:
 *  1. Запрос (залогинен) → success, один неиспользованный токен, письмо со ссылкой.
 *  2. Повторный запрос гасит прежний токен.
 *  3. Валидный токен → closedAt выставлен, email/passwordHash обнулены, сессия убита,
 *     redirect; токен использован.
 *  4. Турниры игрока остаются в БД (мягкое закрытие, запрет 5).
 *  5. Истёкший / использованный / кривой токен → ошибка, аккаунт не закрыт.
 *  6. Закрытый аккаунт с живой сессией не считается залогиненным (getCurrentPlayer null).
 *
 * Бьёт в реальную тестовую базу (trener_test); email-адаптер замокан.
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
  requestAccountClosureAction,
  confirmAccountCloseAction,
  type AuthFormState,
} from "@/features/auth/actions";
import { createSession, getSession } from "@/features/auth/session";
import { getCurrentPlayer } from "@/features/auth/queries";

const initialState: AuthFormState = {};
const TEST_EMAIL = "test-close-account@trener.local";
const PASSWORD = "closemepass123";

function formData(fields: Record<string, string> = {}): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function tokenFrom(text: string): string {
  const m = text.match(/confirm\?token=([a-f0-9]+)/);
  if (!m) throw new Error("в письме нет токена закрытия");
  return m[1];
}

async function currentPlayerId(): Promise<string> {
  const player = await prisma.player.findFirst({ where: { email: TEST_EMAIL } });
  return player!.id;
}

async function requestAndGetToken(): Promise<string> {
  sentEmails.length = 0;
  const result = await requestAccountClosureAction(initialState, formData());
  expect(result).toEqual({ success: true });
  expect(sentEmails).toHaveLength(1);
  return tokenFrom(sentEmails[0].text);
}

beforeEach(async () => {
  cookieStore.clear();
  sentEmails.length = 0;
  vi.clearAllMocks();
  await prisma.player.deleteMany({ where: { email: TEST_EMAIL } });
  await expect(
    registerAction(initialState, formData({ email: TEST_EMAIL, password: PASSWORD, passwordConfirm: PASSWORD, terms: "on" }))
  ).rejects.toThrow("REDIRECT:/");
  sentEmails.length = 0; // выкинуть приветственное письмо
});

afterAll(async () => {
  // closeAccount обнуляет email — чистим по обоим возможным состояниям.
  await prisma.player.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

describe("requestAccountClosureAction", () => {
  it("залогинен → success, один неиспользованный токен, письмо со ссылкой", async () => {
    const playerId = await currentPlayerId();
    const result = await requestAccountClosureAction(initialState, formData());

    expect(result).toEqual({ success: true });
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe(TEST_EMAIL);
    expect(sentEmails[0].text).toMatch(/account\/close\/confirm\?token=[a-f0-9]{64}/);

    const tokens = await prisma.accountClosureToken.findMany({ where: { playerId } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].usedAt).toBeNull();
  });

  it("повторный запрос гасит прежний неиспользованный токен", async () => {
    const playerId = await currentPlayerId();
    await requestAccountClosureAction(initialState, formData());
    await requestAccountClosureAction(initialState, formData());

    const tokens = await prisma.accountClosureToken.findMany({ where: { playerId } });
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((t) => t.usedAt === null)).toHaveLength(1);
  });
});

describe("confirmAccountCloseAction", () => {
  it("валидный токен → анонимизация, сессия убита, redirect, токен использован", async () => {
    const playerId = await currentPlayerId();
    const token = await requestAndGetToken();

    await expect(confirmAccountCloseAction(initialState, formData({ token }))).rejects.toThrow("REDIRECT:/");

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    expect(player!.closedAt).not.toBeNull();
    expect(player!.email).toBeNull();
    expect(player!.passwordHash).toBeNull();
    expect(await getSession()).toBeNull();

    const tokens = await prisma.accountClosureToken.findMany({ where: { playerId } });
    expect(tokens.every((t) => t.usedAt !== null)).toBe(true);
  });

  it("турниры игрока остаются в БД (мягкое закрытие)", async () => {
    const playerId = await currentPlayerId();
    const tournament = await prisma.tournament.create({
      data: { playerId, playedAt: new Date(), status: "CARD_READY" },
    });
    const token = await requestAndGetToken();

    await expect(confirmAccountCloseAction(initialState, formData({ token }))).rejects.toThrow("REDIRECT:/");

    const stillThere = await prisma.tournament.findUnique({ where: { id: tournament.id } });
    expect(stillThere).not.toBeNull();
    await prisma.tournament.delete({ where: { id: tournament.id } });
  });

  it("истёкший токен → ошибка, аккаунт не закрыт", async () => {
    const playerId = await currentPlayerId();
    const token = await requestAndGetToken();
    await prisma.accountClosureToken.updateMany({
      where: { playerId, usedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const result = await confirmAccountCloseAction(initialState, formData({ token }));
    expect(result.error).toMatch(/недействительна или устарела/);
    const player = await prisma.player.findUnique({ where: { id: playerId } });
    expect(player!.closedAt).toBeNull();
  });

  it("использованный токен второй раз → ошибка", async () => {
    const token = await requestAndGetToken();
    await expect(confirmAccountCloseAction(initialState, formData({ token }))).rejects.toThrow("REDIRECT:");

    const result = await confirmAccountCloseAction(initialState, formData({ token }));
    expect(result.error).toMatch(/недействительна или устарела/);
  });

  it("кривой токен → ошибка", async () => {
    const result = await confirmAccountCloseAction(initialState, formData({ token: "deadbeef" }));
    expect(result.error).toMatch(/недействительна или устарела/);
  });

  it("закрытый аккаунт с живой сессией не считается залогиненным", async () => {
    const playerId = await currentPlayerId();
    const token = await requestAndGetToken();
    await expect(confirmAccountCloseAction(initialState, formData({ token }))).rejects.toThrow("REDIRECT:/");

    await createSession(playerId);
    expect(await getCurrentPlayer()).toBeNull();
  });
});

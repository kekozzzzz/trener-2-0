/**
 * Тесты closeAccountAction (features/auth/actions.ts, [[2026-06-15-личный-кабинет]]).
 *
 * Покрывают:
 *  1. Неверный пароль → ошибка, аккаунт не закрыт.
 *  2. Верный пароль → closedAt выставлен, email/passwordHash обнулены, сессия убита, redirect.
 *  3. Турниры игрока остаются в БД (мягкое закрытие, запрет 5).
 *  4. Защита: закрытый аккаунт с живой сессией не считается залогиненным
 *     (getCurrentPlayer === null) — проверка closedAt в queries/session.
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
import { registerAction, closeAccountAction, type AuthFormState } from "@/features/auth/actions";
import { createSession, getSession } from "@/features/auth/session";
import { getCurrentPlayer } from "@/features/auth/queries";

const initialState: AuthFormState = {};
const TEST_EMAIL = "test-close-account@trener.local";
const PASSWORD = "closemepass123";

function formData(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

async function currentPlayerId(): Promise<string> {
  const player = await prisma.player.findFirst({ where: { email: TEST_EMAIL } });
  return player!.id;
}

beforeEach(async () => {
  cookieStore.clear();
  await prisma.player.deleteMany({ where: { email: TEST_EMAIL } });
  await expect(
    registerAction(initialState, formData({ email: TEST_EMAIL, password: PASSWORD, passwordConfirm: PASSWORD, terms: "on" }))
  ).rejects.toThrow("REDIRECT:/");
});

afterAll(async () => {
  // closeAccountAction обнуляет email — чистим по обоим возможным состояниям.
  await prisma.player.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

describe("closeAccountAction", () => {
  it("неверный пароль → ошибка, аккаунт не закрыт", async () => {
    const result = await closeAccountAction(initialState, formData({ password: "wrongpass" }));

    expect(result).toEqual({ error: "Неверный пароль" });
    const player = await prisma.player.findFirst({ where: { email: TEST_EMAIL } });
    expect(player!.closedAt).toBeNull();
    expect(player!.email).toBe(TEST_EMAIL);
  });

  it("верный пароль → анонимизация, сессия убита, redirect", async () => {
    const playerId = await currentPlayerId();

    await expect(closeAccountAction(initialState, formData({ password: PASSWORD }))).rejects.toThrow("REDIRECT:/");

    const player = await prisma.player.findUnique({ where: { id: playerId } });
    expect(player!.closedAt).not.toBeNull();
    expect(player!.email).toBeNull();
    expect(player!.passwordHash).toBeNull();
    expect(await getSession()).toBeNull();
  });

  it("турниры игрока остаются в БД (мягкое закрытие)", async () => {
    const playerId = await currentPlayerId();
    const tournament = await prisma.tournament.create({
      data: { playerId, playedAt: new Date(), status: "CARD_READY" },
    });

    await expect(closeAccountAction(initialState, formData({ password: PASSWORD }))).rejects.toThrow("REDIRECT:/");

    const stillThere = await prisma.tournament.findUnique({ where: { id: tournament.id } });
    expect(stillThere).not.toBeNull();

    await prisma.tournament.delete({ where: { id: tournament.id } });
  });

  it("закрытый аккаунт с живой сессией не считается залогиненным", async () => {
    const playerId = await currentPlayerId();

    await expect(closeAccountAction(initialState, formData({ password: PASSWORD }))).rejects.toThrow("REDIRECT:/");

    // Подделываем живую сессию закрытого игрока (как если бы cookie уцелел на другом устройстве).
    await createSession(playerId);
    expect(await getCurrentPlayer()).toBeNull();
  });
});

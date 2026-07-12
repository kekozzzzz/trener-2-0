/**
 * Тесты входа/регистрации по «волшебной ссылке» (passwordless).
 *
 * Покрывают:
 *  requestMagicLinkAction:
 *   1. Новый email → success, один неиспользованный токен, письмо со ссылкой /enter/verify.
 *   2. Существующий email → success, токен и письмо тоже создаются (ссылка для входа).
 *   3. Повторный запрос гасит прежний неиспользованный токен.
 *   4. Кривой email → ошибка, токен не создаётся.
 *  GET /enter/verify:
 *   5. Токен нового email → redirect /enter/complete + cookie намерения, токен погашен.
 *   6. Токен существующего игрока → redirect / + сессия, токен погашен.
 *   7. Истёкший / использованный ПОСЛЕ грейса / кривой токен → invalid; использованный
 *      В ПРЕДЕЛАХ грейс-окна (60с) → проходит (почтовые сканеры/префетч не ломают вход).
 *  completeRegistrationAction:
 *   8. Живая cookie намерения + согласие → аккаунт без пароля (passwordHash NULL),
 *      cookie намерения снята, сессия выдана, redirect /.
 *   9. Без согласия → ошибка, аккаунт не создаётся.
 *  10. Без cookie намерения → ошибка.
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

import { NextRequest } from "next/server";
import { prisma } from "@/infrastructure/db/client";
import {
  registerAction,
  requestMagicLinkAction,
  completeRegistrationAction,
  type AuthFormState,
} from "@/features/auth/actions";
import { buildPendingRegistrationCookie } from "@/features/auth/session";
import { GET as verifyGet } from "@/app/enter/verify/route";

const initialState: AuthFormState = {};
const NEW_EMAIL = "test-magic-new@trener.local";
const EXISTING_EMAIL = "test-magic-existing@trener.local";
const PASS = "existingpass123";

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

async function requestAndGetToken(email: string): Promise<string> {
  sentEmails.length = 0;
  await requestMagicLinkAction(initialState, formData({ email }));
  expect(sentEmails).toHaveLength(1);
  return tokenFrom(sentEmails[0].text);
}

function verifyRequest(token: string): NextRequest {
  return new NextRequest(`http://localhost:3000/enter/verify?token=${token}`);
}

async function cleanup(): Promise<void> {
  await prisma.magicLinkToken.deleteMany({ where: { email: { in: [NEW_EMAIL, EXISTING_EMAIL] } } });
  await prisma.player.deleteMany({ where: { email: { in: [NEW_EMAIL, EXISTING_EMAIL] } } });
}

beforeEach(async () => {
  cookieStore.clear();
  sentEmails.length = 0;
  vi.clearAllMocks();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await prisma.$disconnect();
});

describe("requestMagicLinkAction", () => {
  it("новый email → success, один неиспользованный токен, письмо со ссылкой", async () => {
    const result = await requestMagicLinkAction(initialState, formData({ email: NEW_EMAIL }));
    expect(result).toEqual({ success: true });
    expect(sentEmails).toHaveLength(1);
    expect(sentEmails[0].to).toBe(NEW_EMAIL);
    expect(sentEmails[0].text).toMatch(/enter\/verify\?token=[a-f0-9]{64}/);

    const tokens = await prisma.magicLinkToken.findMany({ where: { email: NEW_EMAIL } });
    expect(tokens).toHaveLength(1);
    expect(tokens[0].usedAt).toBeNull();
  });

  it("существующий email → success, токен и письмо тоже создаются", async () => {
    await expect(
      registerAction(initialState, formData({ email: EXISTING_EMAIL, password: PASS, passwordConfirm: PASS, terms: "on" }))
    ).rejects.toThrow("REDIRECT:/");
    sentEmails.length = 0;

    const result = await requestMagicLinkAction(initialState, formData({ email: EXISTING_EMAIL }));
    expect(result).toEqual({ success: true });
    expect(sentEmails).toHaveLength(1);
    const tokens = await prisma.magicLinkToken.findMany({ where: { email: EXISTING_EMAIL } });
    expect(tokens).toHaveLength(1);
  });

  it("повторный запрос гасит прежний неиспользованный токен", async () => {
    await requestMagicLinkAction(initialState, formData({ email: NEW_EMAIL }));
    await requestMagicLinkAction(initialState, formData({ email: NEW_EMAIL }));

    const tokens = await prisma.magicLinkToken.findMany({ where: { email: NEW_EMAIL } });
    expect(tokens).toHaveLength(2);
    expect(tokens.filter((t) => t.usedAt === null)).toHaveLength(1);
  });

  it("кривой email → ошибка, токен не создаётся", async () => {
    const result = await requestMagicLinkAction(initialState, formData({ email: "не-почта" }));
    expect(result.error).toMatch(/правильный email/);
    expect(await prisma.magicLinkToken.count({ where: { email: "не-почта" } })).toBe(0);
  });
});

describe("GET /enter/verify", () => {
  it("токен нового email → redirect /enter/complete + cookie намерения, токен погашен", async () => {
    const token = await requestAndGetToken(NEW_EMAIL);
    const res = await verifyGet(verifyRequest(token));

    expect(res.headers.get("location")).toMatch(/\/enter\/complete$/);
    expect(res.cookies.get("pending_registration")?.value).toBeTruthy();
    expect(res.cookies.get("session")).toBeUndefined();

    const row = await prisma.magicLinkToken.findFirst({ where: { email: NEW_EMAIL } });
    expect(row!.usedAt).not.toBeNull();
    // Игрок ещё не создан — только намерение.
    expect(await prisma.player.count({ where: { email: NEW_EMAIL } })).toBe(0);
  });

  it("токен существующего игрока → redirect / + сессия, токен погашен", async () => {
    await expect(
      registerAction(initialState, formData({ email: EXISTING_EMAIL, password: PASS, passwordConfirm: PASS, terms: "on" }))
    ).rejects.toThrow("REDIRECT:/");
    const token = await requestAndGetToken(EXISTING_EMAIL);

    const res = await verifyGet(verifyRequest(token));
    expect(res.headers.get("location")).toMatch(/localhost:3000\/$/);
    expect(res.cookies.get("session")?.value).toBeTruthy();
    expect(res.cookies.get("pending_registration")).toBeUndefined();

    const row = await prisma.magicLinkToken.findFirst({ where: { email: EXISTING_EMAIL } });
    expect(row!.usedAt).not.toBeNull();
  });

  it("истёкший токен → redirect /enter?error=invalid, игрок не создан", async () => {
    const token = await requestAndGetToken(NEW_EMAIL);
    await prisma.magicLinkToken.updateMany({
      where: { email: NEW_EMAIL },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await verifyGet(verifyRequest(token));
    expect(res.headers.get("location")).toMatch(/\/enter\?error=invalid$/);
    expect(await prisma.player.count({ where: { email: NEW_EMAIL } })).toBe(0);
  });

  it("использованный токен второй раз В ПРЕДЕЛАХ ГРЕЙСА → проходит (сканеры/префетч не ломают вход)", async () => {
    const token = await requestAndGetToken(NEW_EMAIL);
    await verifyGet(verifyRequest(token)); // первый проход (например, почтовый антивирус)

    // второй проход сразу же — в пределах грейс-окна → НЕ invalid, тот же результат (идемпотентно)
    const res = await verifyGet(verifyRequest(token));
    expect(res.headers.get("location")).toMatch(/\/enter\/complete$/);
    expect(res.cookies.get("pending_registration")?.value).toBeTruthy();
  });

  it("использованный токен ПОСЛЕ грейса (>60с назад) → redirect /enter?error=invalid", async () => {
    const token = await requestAndGetToken(NEW_EMAIL);
    await verifyGet(verifyRequest(token)); // погасили токен

    // сдвигаем usedAt за пределы грейс-окна — повторный проход уже недействителен
    await prisma.magicLinkToken.updateMany({
      where: { email: NEW_EMAIL },
      data: { usedAt: new Date(Date.now() - 61_000) },
    });
    const res = await verifyGet(verifyRequest(token));
    expect(res.headers.get("location")).toMatch(/\/enter\?error=invalid$/);
  });

  it("кривой токен → redirect /enter?error=invalid", async () => {
    const res = await verifyGet(verifyRequest("deadbeef"));
    expect(res.headers.get("location")).toMatch(/\/enter\?error=invalid$/);
  });
});

describe("completeRegistrationAction", () => {
  it("живая cookie намерения + согласие → аккаунт без пароля, сессия, redirect /", async () => {
    cookieStore.set(...pendingCookie(NEW_EMAIL));

    await expect(
      completeRegistrationAction(initialState, formData({ terms: "on", nickname: "Hero" }))
    ).rejects.toThrow("REDIRECT:/");

    const player = await prisma.player.findUnique({ where: { email: NEW_EMAIL } });
    expect(player).not.toBeNull();
    expect(player!.passwordHash).toBeNull();
    expect(player!.termsAcceptedAt).not.toBeNull();
    expect(player!.nickname).toBe("Hero");
    expect(cookieStore.has("pending_registration")).toBe(false);
    expect(cookieStore.get("session")).toBeTruthy();
  });

  it("без согласия → ошибка, аккаунт не создаётся", async () => {
    cookieStore.set(...pendingCookie(NEW_EMAIL));
    const result = await completeRegistrationAction(initialState, formData({ nickname: "Hero" }));
    expect(result.error).toMatch(/согласиться с условиями/);
    expect(await prisma.player.count({ where: { email: NEW_EMAIL } })).toBe(0);
  });

  it("без cookie намерения → ошибка", async () => {
    const result = await completeRegistrationAction(initialState, formData({ terms: "on" }));
    expect(result.error).toMatch(/устарела/);
  });
});

// Подписанная cookie намерения для существующего email (как её ставит /enter/verify).
function pendingCookie(email: string): [string, string] {
  const { name, value } = buildPendingRegistrationCookie(email);
  return [name, value];
}

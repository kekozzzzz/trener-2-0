import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/infrastructure/db/client";
import { getMagicLinkTtlMs } from "@/config/auth";

const COOKIE_NAME = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 дней
const PENDING_COOKIE_NAME = "pending_registration";

// Описатель cookie — чтобы один и тот же подписанный токен можно было поставить и из
// server action (через cookies().set), и на ответ GET-роута /enter/verify (через
// NextResponse.cookies.set). Set-Cookie из next/headers не всегда переживает
// NextResponse.redirect, поэтому в роуте ставим cookie прямо на ответ.
export type CookieDescriptor = {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
    maxAge: number;
  };
};

function cookieOptions(maxAgeSeconds: number): CookieDescriptor["options"] {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

// iat — момент выдачи (ms epoch). По нему гасим старые сессии: если игрок сменил
// пароль или вышел на всех устройствах, его sessionsValidFrom сдвигается вперёд, и
// любая cookie с iat раньше этой метки перестаёт пускать (проверка в requireSession,
// getCurrentPlayer, authorizeHand — встроена в их запросы к БД).
type SessionPayload = { playerId: string; iat: number; exp: number };

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET не задан");
  return secret;
}

function sign(data: string): string {
  return createHmac("sha256", getSecret()).update(data).digest("base64url");
}

function encode(payload: SessionPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

function decode(token: string): SessionPayload | null {
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as SessionPayload;
    if (
      typeof payload.playerId !== "string" ||
      typeof payload.iat !== "number" ||
      typeof payload.exp !== "number"
    ) {
      return null;
    }
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

// Подписанный cookie сессии как описатель (без записи) — для ответа GET-роута.
export function buildSessionCookie(playerId: string): CookieDescriptor {
  const iat = Date.now();
  const exp = iat + SESSION_TTL_SECONDS * 1000;
  return {
    name: COOKIE_NAME,
    value: encode({ playerId, iat, exp }),
    options: cookieOptions(SESSION_TTL_SECONDS),
  };
}

export async function createSession(playerId: string): Promise<void> {
  const { name, value, options } = buildSessionCookie(playerId);
  const store = await cookies();
  store.set(name, value, options);
}

// ─── Cookie «намерения регистрации» (между кликом по ссылке и экраном согласия) ───
// Токен входа гасим сразу на клике (одноразовость), а подтверждённый email доносим до
// экрана «прими условия + ник» в этой короткоживущей подписанной cookie. Email берём
// ТОЛЬКО из неё, не из URL — подставить чужую почту нельзя. Подпись — тем же HMAC.
type PendingPayload = { email: string; exp: number };

export function buildPendingRegistrationCookie(email: string): CookieDescriptor {
  const exp = Date.now() + getMagicLinkTtlMs();
  const data = Buffer.from(JSON.stringify({ email, exp })).toString("base64url");
  return {
    name: PENDING_COOKIE_NAME,
    value: `${data}.${sign(data)}`,
    options: cookieOptions(Math.floor(getMagicLinkTtlMs() / 1000)),
  };
}

export async function setPendingRegistration(email: string): Promise<void> {
  const { name, value, options } = buildPendingRegistrationCookie(email);
  const store = await cookies();
  store.set(name, value, options);
}

// Вернуть подтверждённый email из cookie намерения (или null, если её нет / подпись не
// сходится / истекла). Чтение допустимо и в server component, и в server action.
export async function readPendingRegistration(): Promise<string | null> {
  const store = await cookies();
  const token = store.get(PENDING_COOKIE_NAME)?.value;
  if (!token) return null;

  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expected = Buffer.from(sign(data));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as PendingPayload;
    if (typeof payload.email !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload.email;
  } catch {
    return null;
  }
}

export async function clearPendingRegistration(): Promise<void> {
  const store = await cookies();
  store.delete(PENDING_COOKIE_NAME);
}

export async function getSession(): Promise<{ playerId: string; iat: number } | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = decode(token);
  return payload ? { playerId: payload.playerId, iat: payload.iat } : null;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function requireSession(): Promise<{ playerId: string }> {
  const session = await getSession();
  if (!session) redirect("/login");

  // Cookie-сессия валидна криптографически, но: аккаунт мог быть закрыт
  // (анонимизирован), либо сессия выдана до смены пароля / выхода на всех
  // устройствах (sessionsValidFrom > iat) — тогда не пускаем. Проверка обоих
  // условий встроена в WHERE, без отдельного обращения к БД. Cookie здесь не
  // трогаем: его нельзя менять при рендере страницы.
  const player = await prisma.player.findFirst({
    where: {
      id: session.playerId,
      closedAt: null,
      sessionsValidFrom: { lte: new Date(session.iat) },
    },
    select: { id: true },
  });
  if (!player) redirect("/login");

  return { playerId: session.playerId };
}

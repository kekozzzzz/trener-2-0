import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/infrastructure/db/client";

const COOKIE_NAME = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 дней

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

export async function createSession(playerId: string): Promise<void> {
  const iat = Date.now();
  const exp = iat + SESSION_TTL_SECONDS * 1000;
  const store = await cookies();
  store.set(COOKIE_NAME, encode({ playerId, iat, exp }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
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

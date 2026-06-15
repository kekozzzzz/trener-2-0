import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/infrastructure/db/client";

const COOKIE_NAME = "session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 дней

type SessionPayload = { playerId: string; exp: number };

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
    if (typeof payload.playerId !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function createSession(playerId: string): Promise<void> {
  const exp = Date.now() + SESSION_TTL_SECONDS * 1000;
  const store = await cookies();
  store.set(COOKIE_NAME, encode({ playerId, exp }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function getSession(): Promise<{ playerId: string } | null> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = decode(token);
  return payload ? { playerId: payload.playerId } : null;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function requireSession(): Promise<{ playerId: string }> {
  const session = await getSession();
  if (!session) redirect("/login");

  // Cookie-сессия валидна криптографически, но аккаунт мог быть закрыт
  // (анонимизирован) — тогда живая сессия на другом устройстве не должна
  // пускать. Cookie здесь не трогаем: его нельзя менять при рендере страницы.
  const player = await prisma.player.findFirst({
    where: { id: session.playerId, closedAt: null },
    select: { id: true },
  });
  if (!player) redirect("/login");

  return session;
}

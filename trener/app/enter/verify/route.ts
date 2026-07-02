import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/infrastructure/db/client";
import { hashMagicToken } from "@/features/auth/magic-link";
import { buildSessionCookie, buildPendingRegistrationCookie } from "@/features/auth/session";
import { recordAuthEvent } from "@/features/auth/auth-events";

// Клик по «волшебной ссылке» из письма (GET). Здесь — развилка вход/регистрация.
// Это route handler, а не страница: при рендере страницы cookie ставить нельзя, а нам
// нужно выдать сессию. Cookie кладём прямо на ответ-редирект (Set-Cookie из next/headers
// не всегда переживает NextResponse.redirect).
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  const invalid = () => NextResponse.redirect(new URL("/enter?error=invalid", req.url));
  if (!token) return invalid();

  const row = await prisma.magicLinkToken.findUnique({
    where: { tokenHash: hashMagicToken(token) },
    select: { id: true, email: true, usedAt: true, expiresAt: true },
  });
  if (!row || row.usedAt || row.expiresAt < new Date()) return invalid();

  // Одноразовость: гасим токен сразу на клике, до развилки.
  await prisma.magicLinkToken.update({ where: { id: row.id }, data: { usedAt: new Date() } });

  // Существующий аккаунт (включая зарегистрированный по паролю) → сразу входим.
  const player = await prisma.player.findFirst({
    where: { email: row.email, closedAt: null },
    select: { id: true },
  });

  if (player) {
    await recordAuthEvent("LOGIN_MAGIC", player.id);
    const res = NextResponse.redirect(new URL("/", req.url));
    const c = buildSessionCookie(player.id);
    res.cookies.set(c.name, c.value, c.options);
    return res;
  }

  // Новый email → регистрация: несём подтверждённый email на экран согласия cookie-меткой.
  const res = NextResponse.redirect(new URL("/enter/complete", req.url));
  const c = buildPendingRegistrationCookie(row.email);
  res.cookies.set(c.name, c.value, c.options);
  return res;
}

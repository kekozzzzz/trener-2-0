import { NextRequest, NextResponse } from "next/server";
import { LOCALE_COOKIE, detectLocale } from "@/i18n/config";

// Первый заход: если куки языка ещё нет — определяем язык по браузеру (Accept-Language)
// и ставим куку. Дальше язык берётся из куки, а сменить его можно тумблером.
export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (!request.cookies.get(LOCALE_COOKIE)) {
    const locale = detectLocale(request.headers.get("accept-language"));
    response.cookies.set(LOCALE_COOKIE, locale, {
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
}

// Пропускаем API, статику и внутренние маршруты Next — язык нужен только на страницах.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, locales, type Locale } from "./config";

// Переключение языка тумблером: пишем куку на год. Компонент после этого делает
// router.refresh(), чтобы сервер перерисовал страницу на новом языке.
export async function setUserLocale(locale: Locale): Promise<void> {
  const safe: Locale = locales.includes(locale) ? locale : "ru";
  (await cookies()).set(LOCALE_COOKIE, safe, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });
}

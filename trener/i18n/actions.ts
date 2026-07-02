"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, locales, type Locale } from "./config";
import { getCurrentPlayer } from "@/features/auth/queries";
import { prisma } from "@/infrastructure/db/client";

// Переключение языка тумблером: пишем куку на год. Компонент после этого делает
// router.refresh(), чтобы сервер перерисовал страницу на новом языке.
export async function setUserLocale(locale: Locale): Promise<void> {
  const safe: Locale = locales.includes(locale) ? locale : "ru";
  (await cookies()).set(LOCALE_COOKIE, safe, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });

  // Если игрок залогинен — сохраняем выбор и в профиле, чтобы письма из крона/вебхука
  // (где куки нет) уходили на его языке. Анонимный кейс не трогаем.
  const player = await getCurrentPlayer();
  if (player) {
    await prisma.player.update({ where: { id: player.id }, data: { locale: safe } });
  }
}

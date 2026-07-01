import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, detectLocale, locales, type Locale } from "./config";

// Серверное определение языка. Приоритет: выбранная кука → язык браузера (Accept-Language).
// Определяем по браузеру прямо при отрисовке, а не только куку из middleware — иначе самый
// первый экран для нового гостя успел бы мигнуть языком по умолчанию до установки куки.
// Клиентские компоненты сюда не импортируют — им нужен только i18n/config.
export async function getUserLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (locales.includes(value as Locale)) return value as Locale;

  return detectLocale((await headers()).get("accept-language"));
}

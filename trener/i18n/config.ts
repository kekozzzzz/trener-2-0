// Клиент-безопасные константы языка (без next/headers): их можно импортировать
// и в серверных, и в клиентских компонентах. Чтение куки живёт в locale.ts.
export type Locale = "ru" | "en";

export const locales: Locale[] = ["ru", "en"];
export const defaultLocale: Locale = "ru";
export const LOCALE_COOKIE = "LOCALE";

// Определить язык по заголовку Accept-Language: русскоязычный браузер → ru, любой другой → en.
// База аудитории — русская, «все остальные» = международные игроки, которым ближе английский.
export function detectLocale(acceptLanguage: string | null | undefined): Locale {
  const primary = (acceptLanguage ?? "").split(",")[0]?.trim().split("-")[0]?.toLowerCase();
  return primary === "ru" ? "ru" : "en";
}

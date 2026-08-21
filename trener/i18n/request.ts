import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "./locale";
import { locales, type Locale } from "./config";

// Конфиг запроса для next-intl: язык берём из куки, сообщения грузим из messages/<locale>.json.
// `locale` в параметрах — ЯВНЫЙ override от вызовов вида `getTranslations({locale: "ru"})`
// (например lib/seo.ts getMetaLocale — метатеги для ботов-краулеров всегда на русском,
// независимо от Accept-Language реального запроса). Без проверки этого параметра такой
// override молча терялся: callback игнорировал его и заново читал locale из куки/заголовков
// через getUserLocale(), так что явно запрошенный русский язык никогда не подхватывался.
export default getRequestConfig(async ({ locale: explicitLocale }) => {
  const locale =
    explicitLocale && locales.includes(explicitLocale as Locale)
      ? (explicitLocale as Locale)
      : await getUserLocale();
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

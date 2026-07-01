import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "./locale";

// Конфиг запроса для next-intl: язык берём из куки, сообщения грузим из messages/<locale>.json.
export default getRequestConfig(async () => {
  const locale = await getUserLocale();
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});

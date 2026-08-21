import type { Metadata } from "next";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { isBotUserAgent } from "@/config/acquisition-sources";
import { defaultLocale, type Locale } from "@/i18n/config";

// Модель индексации — «бельй список»: в корневом layout (app/layout.tsx) ВЕСЬ сайт по
// умолчанию закрыт от поисковиков (robots index:false). Поэтому любая НОВАЯ страница,
// добавленная в будущем, автоматически НЕ попадёт в Google, пока её явно не откроют.
//
// `indexable` — открыть страницу поиску. Вешается ТОЛЬКО на публичные страницы белого
// списка: лендинг, тарифы, правовая информация.
//
// Предпочитай `indexablePage(path)` ниже: он вдобавок к открытию проставляет
// canonical. Голый `indexable` оставлен для обратной совместимости.
export const indexable: Metadata = {
  robots: { index: true, follow: true },
};

// `indexablePage(path)` — открыть страницу поиску И назвать её КАНОНИЧЕСКИЙ адрес.
// Без canonical поисковик, нахватав разные версии одного URL (http/https, с www и
// без, со слэшем и без), не понимает, какая из них «главная», и размывает сигналы
// между дублями. Внешний симптом: сайт находится по полному «https://whygrid.app»,
// но не по имени домена/бренду. canonical это чинит — говорит Google: настоящий
// адрес страницы вот этот, остальные версии склей сюда.
//
// path — относительный («/», «/pricing»). Next разворачивает его в абсолютный
// через metadataBase (app/layout.tsx → https://whygrid.app).
export function indexablePage(path: string): Metadata {
  return {
    robots: { index: true, follow: true },
    alternates: { canonical: path },
  };
}

// Язык для МЕТАДАННЫХ (title/description/og:*), а не для содержимого страницы.
// Превью ссылки в Telegram/WhatsApp/Facebook генерирует КРАУЛЕР получателя, не сам
// человек, — а краулеры обычно не шлют Accept-Language: ru (или не шлют его вовсе).
// Без этой проверки обычный getLocale() (детект по Accept-Language) отдавал ботам
// английский текст по умолчанию (см. i18n/config.ts detectLocale) — превью сайта
// уезжало на английский в ЛЮБОМ русскоязычном канале, кому бы ссылку ни кидали.
// Живому человеку без ru в браузере по-прежнему показываем EN — это осознанный
// выбор бренда для международных игроков, эта проверка его не трогает.
export async function getMetaLocale(): Promise<Locale> {
  const userAgent = (await headers()).get("user-agent");
  if (isBotUserAgent(userAgent)) return defaultLocale;
  return (await getLocale()) as Locale;
}

// `noindex` — явно закрыть страницу. Технически избыточно (корень и так закрывает всё),
// но оставлено как защита и самодокументирование на приватных страницах (кабинет, вход,
// разбор, статус, турниры): сразу видно, что страница не для индекса.
export const noindex: Metadata = {
  robots: { index: false, follow: false },
};

"use client";

import Script from "next/script";
import { getYandexMetrikaId, isMetrikaConfigured } from "@/config/analytics";

// Счётчик Яндекс.Метрики — посещаемость сайта и цели (A/B-тест заголовка на главной,
// см. lib/metrika.ts). Без NEXT_PUBLIC_YANDEX_METRIKA_ID (config/analytics.ts) компонент
// ничего не рендерит — сайт работает как и раньше, тот же принцип, что у SiteVisitTracker.
// Вебвизор и карта кликов намеренно выключены: нужна посещаемость и свои цели, а не запись
// сессий пользователей.
export function Metrika() {
  if (!isMetrikaConfigured()) return null;
  const counterId = getYandexMetrikaId();

  return (
    <>
      <Script id="yandex-metrika" strategy="afterInteractive">
        {`
          (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
          m[i].l=1*new Date();
          for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
          k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
          (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

          ym(${JSON.stringify(Number(counterId))}, "init", {
            clickmap: false,
            trackLinks: true,
            accurateTrackBounce: true,
            webvisor: false
          });
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`https://mc.yandex.ru/watch/${counterId}`}
          style={{ position: "absolute", left: "-9999px" }}
          alt=""
        />
      </noscript>
    </>
  );
}

import "./globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { getAppBaseUrl } from "@/config/app";
import { SiteVisitTracker } from "@/components/site-visit-tracker";
import { CursorGlow } from "@/components/site/cursor-glow";

const inter = localFont({
  src: "../public/fonts/inter-variable.ttf",
  weight: "100 900",
  style: "normal",
  variable: "--font-sans",
  display: "swap",
});

const interHeading = localFont({
  src: "../public/fonts/inter-variable.ttf",
  weight: "100 900",
  style: "normal",
  variable: "--font-heading",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: [
    { path: "../public/fonts/jetbrains-mono-variable.ttf", weight: "100 900", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

// Базовые метаданные на весь сайт. Заголовок и описание главной — здесь (template
// «%s — Whygrid» добавляет суффикс к заголовкам вложенных страниц). По умолчанию
// сайт индексируется; приватные страницы перекрывают это через `noindex` (lib/seo.ts).
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations("Meta");
  return {
    metadataBase: new URL(getAppBaseUrl()),
    title: {
      default: t("siteTitle"),
      template: "%s — Whygrid",
    },
    description: t("siteDescription"),
    applicationName: "Whygrid",
    openGraph: {
      type: "website",
      siteName: "Whygrid",
      locale: locale === "en" ? "en_US" : "ru_RU",
      images: [{ url: "/og/default.png", width: 1200, height: 630, alt: "Whygrid" }],
    },
    twitter: {
      card: "summary_large_image",
      images: ["/og/default.png"],
    },
    // По умолчанию ЗАКРЫТО от поиска — публичные страницы открываются точечно через
    // `indexable` (lib/seo.ts). Так будущие страницы не утекают в Google автоматически.
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={cn("font-sans", inter.variable, interHeading.variable, jetbrainsMono.variable)}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <SiteVisitTracker />
          {/* Свет за курсором — на всех страницах, только для мыши (см. cursor-glow.tsx) */}
          <CursorGlow />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

import "./globals.css";
import type { Metadata } from "next";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";
import { getAppBaseUrl } from "@/config/app";

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
export const metadata: Metadata = {
  metadataBase: new URL(getAppBaseUrl()),
  title: {
    default: "Whygrid — разбор покерных турниров с AI-тренером",
    template: "%s — Whygrid",
  },
  description:
    "Сократовский AI-тренер для турнирного покера. Парсер точно считает твои раздачи, а тренер ведёт вопросами — пока ты сам не увидишь, где теряешь фишки. Первый разбор турнира — бесплатно.",
  applicationName: "Whygrid",
  openGraph: { type: "website", siteName: "Whygrid", locale: "ru_RU" },
  // По умолчанию ЗАКРЫТО от поиска — публичные страницы открываются точечно через
  // `indexable` (lib/seo.ts). Так будущие страницы не утекают в Google автоматически.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      className={cn("font-sans", inter.variable, interHeading.variable, jetbrainsMono.variable)}
    >
      <body>{children}</body>
    </html>
  );
}

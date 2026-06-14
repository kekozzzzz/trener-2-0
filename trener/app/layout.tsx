import "./globals.css";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";

const archivo = localFont({
  src: [
    { path: "../public/fonts/archivo-400.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/archivo-500.ttf", weight: "500", style: "normal" },
  ],
  variable: "--font-sans",
  display: "swap",
});

const archivoBlack = localFont({
  src: "../public/fonts/archivo-black-900.ttf",
  weight: "900",
  style: "normal",
  variable: "--font-heading",
  display: "swap",
});

const jetbrainsMono = localFont({
  src: [
    { path: "../public/fonts/jetbrains-mono-400.ttf", weight: "400", style: "normal" },
    { path: "../public/fonts/jetbrains-mono-500.ttf", weight: "500", style: "normal" },
  ],
  variable: "--font-mono",
  display: "swap",
});

export const metadata = { title: "Тренер 2.0" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ru"
      className={cn("font-sans", archivo.variable, archivoBlack.variable, jetbrainsMono.variable)}
    >
      <body>{children}</body>
    </html>
  );
}

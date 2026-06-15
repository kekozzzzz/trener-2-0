import "./globals.css";
import localFont from "next/font/local";
import { cn } from "@/lib/utils";

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

export const metadata = { title: "Тренер 2.0" };

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

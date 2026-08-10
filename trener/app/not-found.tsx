import Link from "next/link";
import { getLocale } from "next-intl/server";
import { Wordmark } from "@/components/ui/wordmark";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Фирменная 404 вместо дефолтной белой некстовской (QA 2026-07-05, пункт 3):
// тёмный стиль, логотип, путь домой. Рендерится внутри корневого layout —
// глобальные стили и локаль доступны.
export default async function NotFound() {
  const locale = await getLocale();
  const en = locale === "en";

  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full site-wrap items-center px-8 py-6">
          <Link href="/">
            <Wordmark />
          </Link>
        </div>
      </header>
      <section className="mx-auto flex w-full site-wrap flex-1 flex-col items-start justify-center px-8 py-16">
        <p className="font-mono text-label uppercase tracking-label text-muted-foreground">404</p>
        <h1 className="mt-4 text-h1">{en ? "This page folded" : "Такой страницы нет"}</h1>
        <p className="mt-4 max-w-xl text-body text-muted-foreground">
          {en
            ? "The address is wrong or the page has moved. Your tournaments are still where they were."
            : "Адрес неверный или страница переехала. Твои турниры на месте."}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/tournaments" className={cn(buttonVariants())}>
            {en ? "My tournaments" : "Мои турниры"}
          </Link>
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
            {en ? "Home" : "На главную"}
          </Link>
        </div>
      </section>
    </main>
  );
}

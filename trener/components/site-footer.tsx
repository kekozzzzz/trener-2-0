import Link from "next/link";
import { Wordmark } from "@/components/ui/wordmark";

// Общий подвал сайта. Все юр-документы (оферта, политика ПДн, возврат, реквизиты) — на
// одной странице /legal по одной ссылке «Документы» рядом с годом (требование модерации
// платёжки и 152-ФЗ: доступны с любой страницы).
export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-8 py-6 font-mono text-label uppercase tracking-label text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <Wordmark />
        <div className="flex items-center gap-4">
          <Link href="/legal" className="hover:text-foreground">
            Документы
          </Link>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}

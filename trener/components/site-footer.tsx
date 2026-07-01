import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Wordmark } from "@/components/ui/wordmark";

// Общий подвал сайта. Все юр-документы (оферта, политика ПДн, возврат, реквизиты) — на
// одной странице /legal по одной ссылке «Документы» рядом с годом (требование модерации
// платёжки и 152-ФЗ: доступны с любой страницы).
export async function SiteFooter() {
  const t = await getTranslations("Footer");

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-8 py-6 font-mono text-label uppercase tracking-label text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <Wordmark />
        <div className="flex items-center gap-4">
          <Link href="/support" className="hover:text-foreground">
            {t("support")}
          </Link>
          <Link href="/legal" className="hover:text-foreground">
            {t("documents")}
          </Link>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </div>
    </footer>
  );
}

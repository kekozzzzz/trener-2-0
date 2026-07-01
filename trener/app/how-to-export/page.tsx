import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { indexable } from "@/lib/seo";
import { HandHistoryGuide } from "@/components/upload/hand-history-guide";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return {
    ...indexable,
    title: t("howToExportTitle"),
    description: t("howToExportDescription"),
  };
}

export default async function HowToExportPage() {
  const t = await getTranslations("HowToExport");
  return (
    <main>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
          <Link href="/">
            <Wordmark />
          </Link>
          <AuthNav />
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
        <div className="max-w-2xl space-y-4">
          <h1 className="text-h1">{t("title")}</h1>
          <p className="text-body text-muted-foreground">
            {t("intro")}
          </p>
        </div>

        <div className="mt-8">
          <HandHistoryGuide withToggle={false} />
        </div>

        <div className="mt-8 flex flex-col items-start gap-4 border border-border bg-card p-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body text-muted-foreground">
            {t("ctaNote")}
          </p>
          <Link href="/analyze" className={cn(buttonVariants(), "shrink-0")}>
            {t("ctaButton")}
          </Link>
        </div>
      </section>
    </main>
  );
}

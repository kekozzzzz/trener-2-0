import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { PageIntro, BigWordmark } from "@/components/site/detail";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { indexablePage } from "@/lib/seo";
import { HandHistoryGuide } from "@/components/upload/hand-history-guide";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return {
    ...indexablePage("/how-to-export"),
    title: t("howToExportTitle"),
    description: t("howToExportDescription"),
  };
}

export default async function HowToExportPage() {
  const t = await getTranslations("HowToExport");
  return (
    <main>
      <PageHeader />

      <section className="mx-auto site-wrap px-8 py-16 sm:py-24">
        <PageIntro tag={t("sectionTag")} title={t("title")} subtitle={t("intro")} className="max-w-2xl" />

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
        {/* Подвальный вордмарк — общий приём публичных страниц (§4.1 п. 11) */}
        <BigWordmark />
      </section>
    </main>
  );
}

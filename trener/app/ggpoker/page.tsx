import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { indexablePage } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return {
    ...indexablePage("/ggpoker"),
    title: t("ggpokerGuideTitle"),
    description: t("ggpokerGuideDescription"),
  };
}

export default async function GgpokerGuidePage() {
  const t = await getTranslations("GgpokerGuide");

  return (
    <main>
      <PageHeader />

      <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
        <div className="max-w-2xl space-y-4">
          <h1 className="text-h1">{t("title")}</h1>
          <p className="text-body text-muted-foreground">{t("intro")}</p>
        </div>

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("whyMicroTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("whyMicroBody")}</p>
          <p className="mt-6 max-w-2xl text-small text-muted-foreground">
            {t("pushFoldLinkText")}{" "}
            <Link href="/push-fold" className="text-primary underline underline-offset-4">
              {t("pushFoldLinkCta")}
            </Link>
          </p>
        </div>

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("parseTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("parseBody")}</p>
          <p className="mt-6 max-w-2xl text-small text-muted-foreground">
            {t("handReviewLinkText")}{" "}
            <Link href="/hand-review" className="text-primary underline underline-offset-4">
              {t("handReviewLinkCta")}
            </Link>
          </p>
          <p className="mt-2 max-w-2xl text-small text-muted-foreground">
            {t("howToExportLinkText")}{" "}
            <Link href="/how-to-export" className="text-primary underline underline-offset-4">
              {t("howToExportLinkCta")}
            </Link>
          </p>
        </div>

        <div className="mt-16 flex flex-col items-start gap-4 border border-border bg-card p-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body text-muted-foreground">{t("ctaNote")}</p>
          <Link href="/analyze" className={cn(buttonVariants(), "shrink-0")}>
            {t("ctaButton")}
          </Link>
        </div>
      </section>
    </main>
  );
}

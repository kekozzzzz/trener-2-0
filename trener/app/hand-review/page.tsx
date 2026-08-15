import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { PageIntro, BigWordmark } from "@/components/site/detail";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { indexablePage } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return {
    ...indexablePage("/hand-review"),
    title: t("handReviewGuideTitle"),
    description: t("handReviewGuideDescription"),
  };
}

export default async function HandReviewGuidePage() {
  const t = await getTranslations("HandReviewGuide");

  return (
    <main>
      <PageHeader />

      <section className="mx-auto site-wrap px-8 py-16 sm:py-24">
        <PageIntro tag={t("sectionTag")} title={t("title")} subtitle={t("intro")} className="max-w-2xl" />

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("numbersTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("numbersBody")}</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {(
              [
                ["exampleVpipLabel", "exampleVpipDesc"],
                ["examplePotOddsLabel", "examplePotOddsDesc"],
                ["exampleEquityLabel", "exampleEquityDesc"],
              ] as const
            ).map(([labelKey, descKey]) => (
              <div key={labelKey} className="border border-border bg-card p-6">
                <p className="font-mono text-label uppercase tracking-label text-primary">
                  {t(labelKey)}
                </p>
                <p className="mt-3 text-small text-muted-foreground">{t(descKey)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("questionsTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("questionsBody")}</p>
        </div>

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("notTitle")}</h2>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            {(
              [
                ["notSolverLabel", "notSolverDesc"],
                ["notRtaLabel", "notRtaDesc"],
                ["notPromiseLabel", "notPromiseDesc"],
              ] as const
            ).map(([labelKey, descKey]) => (
              <div key={labelKey} className="border border-border bg-card p-6">
                <p className="font-mono text-label uppercase tracking-label text-primary">
                  {t(labelKey)}
                </p>
                <p className="mt-3 text-small text-muted-foreground">{t(descKey)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("startTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("startBody")}</p>
          <p className="mt-6 max-w-2xl text-small text-muted-foreground">
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
        {/* Подвальный вордмарк — общий приём публичных страниц (§4.1 п. 11) */}
        <BigWordmark />
      </section>
    </main>
  );
}

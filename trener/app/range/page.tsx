import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { PageIntro, BigWordmark } from "@/components/site/detail";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { indexablePage } from "@/lib/seo";
import { ReferenceChartsPanel } from "@/components/charts/reference-charts-panel";
import { rfiOpenRange } from "@/config/poker/rfi-chart";
import { percentOf } from "@/config/poker/hand-grid";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return {
    ...indexablePage("/range"),
    title: t("rangeGuideTitle"),
    description: t("rangeGuideDescription"),
  };
}

// Цифры «тайтовый/широкий» считаются из ТОГО ЖЕ конфига, что и чарт открытия
// (config/poker/rfi-chart.ts) — не хардкод в тексте, не разъедется при правке чарта.
export default async function RangeGuidePage() {
  const t = await getTranslations("RangeGuide");
  const utgPct = percentOf(rfiOpenRange("UTG")).toFixed(1);
  const btnPct = percentOf(rfiOpenRange("BTN")).toFixed(1);

  return (
    <main>
      <PageHeader />

      <section className="mx-auto site-wrap px-8 py-16 sm:py-24">
        <PageIntro tag={t("sectionTag")} title={t("title")} subtitle={t("intro")} className="max-w-2xl" />

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("whyTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("whyBody")}</p>
        </div>

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("gridTitle")}</h2>
          <p className="mt-2 max-w-2xl text-small text-muted-foreground">{t("gridIntro")}</p>
          <div className="mt-6">
            <ReferenceChartsPanel />
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("tightWideTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">
            {t("tightWideBody", { utg: utgPct, btn: btnPct })}
          </p>
        </div>

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("inProductTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("inProductBody")}</p>
          <p className="mt-6 max-w-2xl text-small text-muted-foreground">
            {t("chartsLinkText")}{" "}
            <Link href="/charts" className="text-primary underline underline-offset-4">
              {t("chartsLinkCta")}
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

import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { indexablePage } from "@/lib/seo";
import { PushChartPanel } from "@/components/charts/push-chart-panel";
import { pushRangeCodes } from "@/config/poker/push-fold-chart";
import { percentOf } from "@/config/poker/hand-grid";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return {
    ...indexablePage("/push-fold"),
    title: t("pushFoldGuideTitle"),
    description: t("pushFoldGuideDescription"),
  };
}

// Цифры считаются из ТОГО ЖЕ конфига, что и сам чарт (push-fold-chart.ts) — не
// хардкод в тексте, не разъедется при правке чарта.
export default async function PushFoldGuidePage() {
  const t = await getTranslations("PushFoldGuide");
  const utgPct = percentOf(pushRangeCodes("SHORT", "UTG")).toFixed(1);
  const btnPct = percentOf(pushRangeCodes("SHORT", "BTN")).toFixed(1);

  return (
    <main>
      <PageHeader />

      <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
        <div className="max-w-2xl space-y-4">
          <h1 className="text-h1">{t("title")}</h1>
          <p className="text-body text-muted-foreground">{t("intro")}</p>
        </div>

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("whenTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("whenBody")}</p>
          <div className="mt-6">
            <PushChartPanel />
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("numbersTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">
            {t("numbersBody", { utg: utgPct, btn: btnPct })}
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
      </section>
    </main>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { PageIntro, BigWordmark } from "@/components/site/detail";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { indexablePage } from "@/lib/seo";
import { LEAK_WINDOW_DAYS, LEAK_ACTIVE_MIN_DAYS } from "@/config/leaks";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return {
    ...indexablePage("/leaks"),
    title: t("leaksGuideTitle"),
    description: t("leaksGuideDescription"),
  };
}

// Ровно 8 категорий лик-трекера (features/profile/leak-trend.ts, LEAK_KINDS) -
// не придумываем девятую и не переименовываем, чтобы текст не разошёлся с кодом.
const LEAK_KINDS = [
  ["openWideLabel", "openWideDesc"],
  ["limpLabel", "limpDesc"],
  ["bb3betLabel", "bb3betDesc"],
  ["shoveLabel", "shoveDesc"],
  ["vsOpen3betLabel", "vsOpen3betDesc"],
  ["isoLabel", "isoDesc"],
  ["squeezeLabel", "squeezeDesc"],
  ["fourbetLabel", "fourbetDesc"],
] as const;

export default async function LeaksGuidePage() {
  const t = await getTranslations("LeaksGuide");

  return (
    <main>
      <PageHeader />

      <section className="mx-auto site-wrap px-8 py-16 sm:py-24">
        <PageIntro tag={t("sectionTag")} title={t("title")} subtitle={t("intro")} className="max-w-2xl" />

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("kindsTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("kindsIntro")}</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {LEAK_KINDS.map(([labelKey, descKey]) => (
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
          <h2 className="text-h2">{t("systematicTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">
            {t("systematicBody", { minDays: LEAK_ACTIVE_MIN_DAYS, window: LEAK_WINDOW_DAYS })}
          </p>
        </div>

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("inProductTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("inProductBody")}</p>
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

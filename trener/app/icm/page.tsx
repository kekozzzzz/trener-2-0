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
    ...indexablePage("/icm"),
    title: t("icmGuideTitle"),
    description: t("icmGuideDescription"),
  };
}

// Пороги зон (20/10/6/1 круга) держим в тексте руками, не импортируем из
// parser/facts.ts — там они инлайн внутри функции, не отдельный конфиг. Это
// ТЕ ЖЕ числа, что использует тренер (Зона стека: ..., parser/facts.ts) — при
// правке порогов в парсере проверить и здесь.
export default async function IcmGuidePage() {
  const t = await getTranslations("IcmGuide");

  const zones = [
    ["zoneGreenLabel", "zoneGreenDesc"],
    ["zoneYellowLabel", "zoneYellowDesc"],
    ["zoneOrangeLabel", "zoneOrangeDesc"],
    ["zoneRedLabel", "zoneRedDesc"],
    ["zoneDeadLabel", "zoneDeadDesc"],
  ] as const;

  return (
    <main>
      <PageHeader />

      <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
        <PageIntro tag={t("sectionTag")} title={t("title")} subtitle={t("intro")} className="max-w-2xl" />

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("whyTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("whyBody")}</p>
        </div>

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("zonesTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("zonesIntro")}</p>

          <div className="mt-8 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-5">
            {zones.map(([labelKey, descKey]) => (
              <div key={labelKey} className="bg-card p-5">
                <p className="font-mono text-label uppercase tracking-label text-primary">
                  {t(labelKey)}
                </p>
                <p className="mt-3 text-small text-muted-foreground">{t(descKey)}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("inProductTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("inProductBody")}</p>
          <p className="mt-6 max-w-2xl text-small text-muted-foreground">
            {t("pushFoldLinkText")}{" "}
            <Link href="/push-fold" className="text-primary underline underline-offset-4">
              {t("pushFoldLinkCta")}
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

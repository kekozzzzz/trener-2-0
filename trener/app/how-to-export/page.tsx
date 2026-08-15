import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { PageIntro, BigWordmark } from "@/components/site/detail";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { indexablePage } from "@/lib/seo";
import { HandHistoryGuide } from "@/components/upload/hand-history-guide";
import { SUPPORTED_ROOMS } from "@/config/rooms";

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
  const tRoom = await getTranslations("UploadGuide");

  return (
    <main>
      <PageHeader />

      <section className="mx-auto site-wrap px-8 py-16 sm:py-24">
        <PageIntro tag={t("sectionTag")} title={t("title")} subtitle={t("intro")} className="max-w-2xl" />

        {/* Прямые ссылки на отдельные страницы по руму (SEO 2026-08-15): у каждого
            рума своя страница с точным заголовком под запрос вида «как выгрузить
            историю раздач <рум>» — раскрывашки ниже остаются для тех, кто уже здесь. */}
        <ul className="mt-10 grid gap-3 sm:grid-cols-2">
          {SUPPORTED_ROOMS.map((room) => (
            <li key={room.id}>
              <Link
                href={`/how-to-export/${room.id}`}
                className="text-primary underline underline-offset-4"
              >
                {tRoom(`exportTitle.${room.id}`)}
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-16 border-t border-border pt-16">
          <HandHistoryGuide withToggle={false} />
        </div>

        <p className="mt-8 max-w-2xl text-small text-muted-foreground">
          {t("handReviewLinkText")}{" "}
          <Link href="/hand-review" className="text-primary underline underline-offset-4">
            {t("handReviewLinkCta")}
          </Link>
        </p>

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

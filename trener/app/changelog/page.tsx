import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { indexablePage } from "@/lib/seo";
import { PageHeader } from "@/components/page-header";
import { SiteFooter } from "@/components/site-footer";
import { PageIntro, BigWordmark } from "@/components/site/detail";
import { CHANGELOG_ENTRIES } from "@/config/changelog";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return {
    ...indexablePage("/changelog"),
    title: t("changelogTitle"),
    description: t("changelogDescription"),
  };
}

export default async function ChangelogPage() {
  const t = await getTranslations("Changelog");
  const locale = await getLocale();

  return (
    <main>
      <PageHeader />

      <section className="mx-auto site-wrap px-8 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl">
          <PageIntro tag={t("sectionTag")} title={t("title")} subtitle={t("subtitle")} />

          <div className="mt-12">
            {CHANGELOG_ENTRIES.map((entry) => (
              <div
                key={entry.date}
                className="border-t border-border py-6 first:border-t-0 sm:grid sm:grid-cols-[140px_1fr] sm:gap-6"
              >
                <p className="font-mono text-label uppercase tracking-label text-primary">
                  {new Date(entry.date).toLocaleDateString(locale, {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </p>
                <p className="mt-2 text-body sm:mt-0">{locale === "en" ? entry.en : entry.ru}</p>
              </div>
            ))}
          </div>
        </div>

        <BigWordmark />
      </section>

      <SiteFooter />
    </main>
  );
}

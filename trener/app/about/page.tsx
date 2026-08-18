import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { SiteFooter } from "@/components/site-footer";
import { PageIntro, BigWordmark } from "@/components/site/detail";
import { indexablePage } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return {
    ...indexablePage("/about"),
    title: t("aboutTitle"),
    description: t("aboutDescription"),
  };
}

export default async function AboutPage() {
  const t = await getTranslations("About");
  const paragraphs = [t("p1"), t("p2"), t("p3"), t("p4"), t("p5")];

  return (
    <main>
      <PageHeader />

      <section className="mx-auto site-wrap px-8 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl">
          <PageIntro tag={t("sectionTag")} title={t("title")} />

          <div className="mt-12 space-y-6">
            {paragraphs.map((paragraph, i) => (
              <p key={i} className="text-body">
                {paragraph}
              </p>
            ))}
          </div>
        </div>

        <BigWordmark />
      </section>

      <SiteFooter hideWordmark />
    </main>
  );
}

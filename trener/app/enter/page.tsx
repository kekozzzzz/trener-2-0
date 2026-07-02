import { noindex } from "@/lib/seo";
export const metadata = noindex;
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BlurFade } from "@/components/ui/blur-fade";
import { Wordmark } from "@/components/ui/wordmark";
import { LangSwitcher } from "@/components/lang-switcher";
import { EnterForm } from "./enter-form";

export default async function EnterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const t = await getTranslations("MagicLink");

  return (
    <main>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
          <Link href="/">
            <Wordmark />
          </Link>
          <LangSwitcher />
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
        <BlurFade direction="up" offset={8} blur="0px" duration={0.3}>
          <div className="mx-auto max-w-md space-y-8">
            <div className="space-y-2 text-center">
              <h1 className="text-h1">{t("title")}</h1>
              <p className="text-body text-muted-foreground">
                {t("subtitle")}
              </p>
            </div>
            {error === "invalid" && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-center text-small text-foreground">
                {t("invalidLink")}
              </p>
            )}
            <EnterForm />
          </div>
        </BlurFade>
      </section>
    </main>
  );
}

import { noindex } from "@/lib/seo";
export const metadata = noindex;
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BlurFade } from "@/components/ui/blur-fade";
import { Wordmark } from "@/components/ui/wordmark";
import { LangSwitcher } from "@/components/lang-switcher";
import { LoginForm } from "./login-form";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  const t = await getTranslations("Login");

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
              <p className="text-body text-muted-foreground">{t("subtitle")}</p>
            </div>
            {reset === "1" && (
              <p className="rounded-md border border-border bg-muted/40 p-3 text-center text-small text-foreground">
                {t("resetDone")}
              </p>
            )}
            <LoginForm />
          </div>
        </BlurFade>
      </section>
    </main>
  );
}

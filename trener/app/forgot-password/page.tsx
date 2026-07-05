import { noindex } from "@/lib/seo";
import { getLocale } from "next-intl/server";

// Заголовок вкладки — иначе все страницы назывались как лендинг (QA 2026-07-05, п.10).
export async function generateMetadata() {
  const locale = await getLocale();
  return { ...noindex, title: locale === "en" ? "Password reset" : "Восстановление пароля" };
}
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BlurFade } from "@/components/ui/blur-fade";
import { Wordmark } from "@/components/ui/wordmark";
import { ForgotPasswordForm } from "./forgot-password-form";

export default async function ForgotPasswordPage() {
  const t = await getTranslations("ForgotPassword");

  return (
    <main>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
          <Link href="/">
            <Wordmark />
          </Link>
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
            <ForgotPasswordForm />
          </div>
        </BlurFade>
      </section>
    </main>
  );
}

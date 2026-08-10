import { noindex } from "@/lib/seo";
export const metadata = noindex;
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BlurFade } from "@/components/ui/blur-fade";
import { Wordmark } from "@/components/ui/wordmark";
import { ResetPasswordForm } from "./reset-password-form";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const t = await getTranslations("ResetPassword");

  return (
    <main>
      <header className="border-b border-border">
        <div className="mx-auto flex site-wrap items-center justify-between px-8 py-6">
          <Link href="/">
            <Wordmark />
          </Link>
        </div>
      </header>

      <section className="mx-auto site-wrap px-8 py-16 sm:py-24">
        <BlurFade direction="up" offset={8} blur="0px" duration={0.3}>
          <div className="mx-auto max-w-md space-y-8">
            <div className="space-y-2 text-center">
              <h1 className="text-h1">{t("title")}</h1>
              <p className="text-body text-muted-foreground">{t("subtitle")}</p>
            </div>

            {token ? (
              <ResetPasswordForm token={token} />
            ) : (
              <div className="space-y-6">
                <p className="rounded-md border border-border bg-muted/40 p-4 text-small text-foreground">
                  {t("invalidLink")}
                </p>
                <p className="text-small text-muted-foreground">
                  <Link href="/forgot-password" className="text-foreground underline">
                    {t("requestLink")}
                  </Link>
                </p>
              </div>
            )}
          </div>
        </BlurFade>
      </section>
    </main>
  );
}

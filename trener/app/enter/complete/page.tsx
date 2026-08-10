import { noindex } from "@/lib/seo";
export const metadata = noindex;
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { BlurFade } from "@/components/ui/blur-fade";
import { Wordmark } from "@/components/ui/wordmark";
import { readPendingRegistration } from "@/features/auth/session";
import { CompleteForm } from "./complete-form";

export default async function CompleteRegistrationPage() {
  // Без живой cookie намерения сюда заходить нечем (ссылка устарела / открыли напрямую).
  const email = await readPendingRegistration();
  if (!email) redirect("/enter");
  const t = await getTranslations("MagicLink");

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
              <h1 className="text-h1">{t("completeTitle")}</h1>
              <p className="text-body text-muted-foreground">
                {t("completeSubtitlePrefix")}<span className="text-foreground">{email}</span>{t("completeSubtitleSuffix")}
              </p>
            </div>
            <CompleteForm />
          </div>
        </BlurFade>
      </section>
    </main>
  );
}

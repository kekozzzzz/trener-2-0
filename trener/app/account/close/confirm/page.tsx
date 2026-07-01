import { noindex } from "@/lib/seo";
export const metadata = noindex;
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { BlurFade } from "@/components/ui/blur-fade";
import { Wordmark } from "@/components/ui/wordmark";
import { prisma } from "@/infrastructure/db/client";
import { hashClosureToken } from "@/features/auth/account-closure";
import { ConfirmCloseForm } from "./confirm-close-form";

export default async function ConfirmCloseAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const t = await getTranslations("CloseAccount");

  // Проверяем годность ссылки ТОЛЬКО для показа — токен здесь не гасим (иначе почтовый
  // сканер, открыв страницу, сжёг бы ссылку). Закрытие происходит по кнопке (POST).
  let valid = false;
  if (token) {
    const row = await prisma.accountClosureToken.findUnique({
      where: { tokenHash: hashClosureToken(token) },
      select: { usedAt: true, expiresAt: true, player: { select: { closedAt: true } } },
    });
    valid = Boolean(row && !row.usedAt && row.expiresAt >= new Date() && row.player && !row.player.closedAt);
  }

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
              <h1 className="text-h1">{t("confirmTitle")}</h1>
            </div>
            {valid ? (
              <>
                <p className="text-small text-muted-foreground">
                  {t("confirmWarning")}
                </p>
                <ConfirmCloseForm token={token!} />
                <p className="text-small text-muted-foreground">
                  {t("changedMind")}{" "}
                  <Link href="/account" className="text-foreground underline">
                    {t("backToAccount")}
                  </Link>
                </p>
              </>
            ) : (
              <div className="space-y-6">
                <p className="rounded-md border border-border bg-muted/40 p-4 text-small text-foreground">
                  {t("invalidLink")}
                </p>
                <p className="text-small text-muted-foreground">
                  <Link href="/account" className="text-foreground underline">
                    {t("goToAccount")}
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

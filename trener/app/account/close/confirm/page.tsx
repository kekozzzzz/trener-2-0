import { noindex } from "@/lib/seo";
export const metadata = noindex;
import Link from "next/link";
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
              <h1 className="text-h1">Закрыть аккаунт?</h1>
            </div>
            {valid ? (
              <>
                <p className="text-small text-muted-foreground">
                  Это необратимо: email и пароль удаляются, доступ к турнирам и разборам пропадёт
                  (сами разборы остаются в базе обезличенными). Нажми кнопку, чтобы подтвердить.
                </p>
                <ConfirmCloseForm token={token!} />
                <p className="text-small text-muted-foreground">
                  Передумал?{" "}
                  <Link href="/account" className="text-foreground underline">
                    Вернуться в аккаунт
                  </Link>
                </p>
              </>
            ) : (
              <div className="space-y-6">
                <p className="rounded-md border border-border bg-muted/40 p-4 text-small text-foreground">
                  Ссылка недействительна или устарела. Запроси закрытие заново на странице аккаунта.
                </p>
                <p className="text-small text-muted-foreground">
                  <Link href="/account" className="text-foreground underline">
                    Перейти в аккаунт
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

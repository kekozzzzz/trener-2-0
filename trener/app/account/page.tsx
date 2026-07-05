import { noindex } from "@/lib/seo";
import { getLocale } from "next-intl/server";

// Заголовок вкладки — иначе все страницы назывались как лендинг (QA 2026-07-05, п.10).
export async function generateMetadata() {
  const locale = await getLocale();
  return { ...noindex, title: locale === "en" ? "Account" : "Аккаунт" };
}
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/features/auth/session";
import { getCurrentPlayer } from "@/features/auth/queries";
import { logoutAction, logoutEverywhereAction } from "@/features/auth/actions";
import { getSubscriptionState, periodEnd } from "@/features/subscription/access";
import { cancelScheduledPlan } from "@/features/subscription/actions";
import { CancelAutoRenewButton } from "@/components/subscription/cancel-autorenew-button";
import { getPlan } from "@/config/plans";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { ChangePasswordForm } from "./change-password-form";
import { SetPasswordForm } from "./set-password-form";
import { CloseAccountForm } from "./close-account-form";
import { NicknameForm } from "./nickname-form";

export default async function AccountPage() {
  const t = await getTranslations("Account");
  const { playerId } = await requireSession();
  const player = await getCurrentPlayer();
  const sub = await getSubscriptionState(playerId);
  const plan = getPlan(sub.planCode);
  const scheduledPlan = getPlan(sub.subscription?.scheduledPlanCode);
  const isCanceled = sub.subscription?.status === "CANCELED";
  // Автопродление есть, только если у ЭТОЙ подписки сохранена карта (paymentMethodId):
  // разовая оплата (СБП/без сохранения) карты не оставляет → подписка не продлевается
  // сама, и текст/кнопки не должны обещать обратное.
  const hasAutopay = !isCanceled && Boolean(sub.subscription?.paymentMethodId);

  return (
    <main>
      <PageHeader />
      <section className="mx-auto max-w-2xl px-8 py-16">
        <h1 className="text-h1">{t("title")}</h1>

        <div className="mt-8 space-y-2">
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">{t("emailLabel")}</p>
          <p className="text-body text-foreground">{player?.email ?? "—"}</p>
        </div>

        <div className="mt-12 border-t border-border pt-12">
          <h2 className="text-h2">{t("nicknameTitle")}</h2>
          <p className="mt-2 text-small text-muted-foreground">
            {t("nicknameHint")}
          </p>
          <NicknameForm defaultNickname={player?.nickname ?? ""} />
        </div>

        <div className="mt-12 border-t border-border pt-12">
          <h2 className="text-h2">{t("subscriptionTitle")}</h2>
          {sub.hasAccess && sub.subscription && plan ? (
            <div className="mt-4 space-y-4">
              <div className="space-y-2">
                <p className="text-body text-foreground">{t("planLine", { plan: plan.title })}</p>
                <p className="text-small text-muted-foreground">
                  {hasAutopay ? t("renews") : t("activeUntil")}{" "}
                  <span className="font-mono">
                    {periodEnd(sub.subscription).toLocaleDateString("ru-RU")}
                  </span>
                  {isCanceled && t("canceledNote")}
                  {!isCanceled && !hasAutopay && t("manualRenewNote")}
                </p>
                {scheduledPlan && (
                  <p className="text-small text-muted-foreground">
                    {t("scheduledChange", { plan: scheduledPlan.title })}{" "}
                    <form action={cancelScheduledPlan} className="mt-1">
                      <button
                        type="submit"
                        className="font-mono text-label uppercase tracking-label text-primary transition-colors hover:text-foreground"
                      >
                        {t("cancelScheduledChange")}
                      </button>
                    </form>
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-3 pt-1">
                <Link href="/pricing" className={cn(buttonVariants({ variant: "outline" }))}>
                  {t("changePlan")}
                </Link>
              </div>
              {hasAutopay && <CancelAutoRenewButton />}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <p className="text-small text-muted-foreground">
                {t("noSubscription")}
              </p>
              <Link href="/pricing" className={cn(buttonVariants())}>
                {t("choosePlan")}
              </Link>
            </div>
          )}
        </div>

        <div className="mt-12 border-t border-border pt-12">
          <h2 className="text-h2">{player?.hasPassword ? t("changePassword") : t("setPassword")}</h2>
          <p className="mt-2 text-small text-muted-foreground">
            {player?.hasPassword
              ? player?.passwordChangedAt
                ? t("passwordChangedAt", { date: player.passwordChangedAt.toLocaleDateString("ru-RU") })
                : t("passwordNeverChanged")
              : t("noPasswordHint")}
          </p>
          <div className="mt-6">{player?.hasPassword ? <ChangePasswordForm /> : <SetPasswordForm />}</div>
        </div>

        <div className="mt-12 border-t border-border pt-12 space-y-6">
          <form action={logoutAction}>
            <Button type="submit" variant="outline">
              {t("logout")}
            </Button>
          </form>

          <div>
            <form action={logoutEverywhereAction}>
              <Button type="submit" variant="outline">
                {t("logoutEverywhere")}
              </Button>
            </form>
            <p className="mt-2 text-small text-muted-foreground">
              {t("logoutEverywhereHint")}
            </p>
          </div>
        </div>

        <div className="mt-12 border-t border-border pt-12">
          <h2 className="text-h2">{t("closeAccountTitle")}</h2>
          <div className="mt-6">
            <CloseAccountForm />
          </div>
        </div>
      </section>
    </main>
  );
}

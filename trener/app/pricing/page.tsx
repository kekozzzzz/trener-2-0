import Link from "next/link";
import { Check } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { PricingCard } from "@/components/ui/pricing-card";
import { CheckoutButton } from "@/components/subscription/checkout-button";
import { getPlans, formatUsd } from "@/config/plans";
import { isRecurringEnabled } from "@/config/payments";
import { getSession } from "@/features/auth/session";
import { getSubscriptionState } from "@/features/subscription/access";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { indexable } from "@/lib/seo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Meta");
  return {
    ...indexable,
    title: t("pricingTitle"),
    description: t("pricingDescription"),
  };
}

export default async function PricingPage() {
  const t = await getTranslations("Pricing");
  const tc = await getTranslations("Common");

  // Возможности ОДИНАКОВЫ на всех тарифах: отличаются только числом разборов за месяц
  // (tournamentLimit). Поэтому список «что входит» — один общий блок под колонками.
  const SHARED_FEATURES = [
    t("feature1"),
    t("feature2"),
    t("feature3"),
    t("feature4"),
  ];

  // Различие тарифов для пользователя — видимое число разборов турниров в месяц.
  // Загрузка и метрики бесплатны и безлимитны; лимит тратит только запуск разбора.
  const volumeNote = (tournamentLimit: number): string =>
    t("volumeNote", { limit: tournamentLimit });

  const session = await getSession();
  const state = session ? await getSubscriptionState(session.playerId) : null;
  const currentPlan = state?.hasAccess ? state.planCode : null;
  const plans = getPlans();
  // Автоплатёж сохраняет только карту → форма ЮKassa станет card-only. Поэтому для новой
  // подписки даём два пути: картой с автопродлением ИЛИ разово любым способом (СБП и др.).
  const recurringOn = isRecurringEnabled();

  return (
    <main>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
          <Link href="/">
            <Wordmark />
          </Link>
          <AuthNav />
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl space-y-4 text-center">
          <h1 className="text-h1">{t("title")}</h1>
          <p className="text-body text-muted-foreground">
            {t("subtitle")}
          </p>
          <p className="text-small text-muted-foreground">
            {t("currencyNote")}
          </p>
        </div>

        <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.code;

            let cta;
            if (!session) {
              // Гость: сначала вход/регистрация по ссылке, оплата — уже из кабинета.
              cta = (
                <Link href="/enter" className={cn(buttonVariants(), "w-full justify-center")}>
                  {t("ctaStart")}
                </Link>
              );
            } else if (isCurrent) {
              cta = (
                <Link
                  href="/account"
                  className={cn(buttonVariants({ variant: "outline" }), "w-full justify-center")}
                >
                  {t("ctaCurrent")}
                </Link>
              );
            } else if (currentPlan) {
              // Подписчик меняет тариф → switch (апгрейд сразу с зачётом, даунгрейд —
              // со следующего периода).
              cta = (
                <CheckoutButton planCode={plan.code} label={t("ctaSwitch")} mode="switch" />
              );
            } else if (recurringOn) {
              // Новая подписка: два способа оплаты.
              cta = (
                <div className="space-y-2">
                  <CheckoutButton planCode={plan.code} label={t("ctaCard")} recurring />
                  <CheckoutButton planCode={plan.code} label={t("ctaOneTime")} variant="outline" />
                  <p className="text-small text-muted-foreground">
                    {t("paymentNote")}
                  </p>
                </div>
              );
            } else {
              // Рекуррент выключен — только разовая оплата.
              cta = <CheckoutButton planCode={plan.code} label={t("ctaSubscribe")} />;
            }

            return (
              <PricingCard
                key={plan.code}
                title={plan.title}
                description={plan.description}
                priceLabel={formatUsd(plan.priceUsd)}
                period={tc("perMonth")}
                volumeNote={volumeNote(plan.tournamentLimit)}
                cta={cta}
              />
            );
          })}
        </div>

        {/* Общий блок: что входит в ЛЮБОЙ тариф (одинаково для всех). */}
        <div className="mt-4 border border-border bg-card p-8">
          <h2 className="font-mono text-label uppercase tracking-label text-muted-foreground">
            {t("includedTitle")}
          </h2>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {SHARED_FEATURES.map((item) => (
              <li key={item} className="flex items-center gap-2 text-body">
                <Check className="size-4 shrink-0 text-primary" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { PricingCard } from "@/components/ui/pricing-card";
import { CheckoutButton } from "@/components/subscription/checkout-button";
import { getPlans, formatRubles } from "@/config/plans";
import { getSession } from "@/features/auth/session";
import { getSubscriptionState } from "@/features/subscription/access";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// Набор возможностей одинаков на всех тарифах — они отличаются только бюджетом, то есть
// тем, сколько разборов в месяц укладывается в лимит (кредитная модель,
// plans/2026-06-21-кредитная-система.md). Поэтому различитель в карточке — цена и
// мягкая оценка «≈ N разборов», а список функций общий.
const SHARED_FEATURES = [
  "Сократовский диалог «почему» по ключевым раздачам",
  "Чат по любой раздаче карточки",
  "Общая картина турнира",
  "Точные числа от парсера, а не догадки ИИ",
];

export default async function PricingPage() {
  const session = await getSession();
  const state = session ? await getSubscriptionState(session.playerId) : null;
  const currentPlan = state?.hasAccess ? state.planCode : null;
  const plans = getPlans();

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
          <h1 className="text-h1">Тарифы</h1>
          <p className="text-body text-muted-foreground">
            Первый турнир — бесплатно после регистрации. Дальше выбирай тариф под то,
            как много хочешь разбирать. Тарифы отличаются объёмом, набор возможностей —
            один.
          </p>
        </div>

        <div className="mt-12 grid items-start gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.code;
            const features = [
              {
                title: "Что входит",
                items: [`≈ ${plan.approxAnalyses} разборов турниров в месяц`, ...SHARED_FEATURES],
              },
            ];

            let cta;
            if (!session) {
              // Гость: сначала регистрация, оплата — уже из кабинета/со страницы цен.
              cta = (
                <Link
                  href="/register"
                  className={cn(buttonVariants(), "w-full justify-center")}
                >
                  Начать
                </Link>
              );
            } else if (isCurrent) {
              cta = (
                <Link
                  href="/account"
                  className={cn(buttonVariants({ variant: "outline" }), "w-full justify-center")}
                >
                  Текущий тариф
                </Link>
              );
            } else {
              // Подписчик меняет тариф → switch (апгрейд сразу с зачётом, даунгрейд —
              // со следующего периода). Без подписки → новая оплата.
              cta = (
                <CheckoutButton
                  planCode={plan.code}
                  label={currentPlan ? "Перейти на этот" : "Оформить"}
                  mode={currentPlan ? "switch" : "new"}
                />
              );
            }

            return (
              <PricingCard
                key={plan.code}
                title={plan.title}
                description={plan.description}
                priceLabel={formatRubles(plan.amountKopecks)}
                features={features}
                cta={cta}
              />
            );
          })}
        </div>
      </section>
    </main>
  );
}

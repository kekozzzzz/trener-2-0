import Link from "next/link";
import { Check } from "lucide-react";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { PricingCard } from "@/components/ui/pricing-card";
import { CheckoutButton } from "@/components/subscription/checkout-button";
import { getPlans, formatUsd, getPlan } from "@/config/plans";
import { getSession } from "@/features/auth/session";
import { getSubscriptionState } from "@/features/subscription/access";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// Возможности ОДИНАКОВЫ на всех тарифах (кредитная модель,
// plans/2026-06-21-кредитная-система.md): тарифы отличаются только невидимым бюджетом.
// Поэтому список «что входит» — один общий блок под колонками, а не повтор в каждой.
const SHARED_FEATURES = [
  "Сократовский диалог «почему» по ключевым раздачам",
  "Чат по любой раздаче карточки",
  "Общая картина турнира",
  "Точные числа от парсера, а не догадки ИИ",
];

// Различие тарифов для пользователя — относительный объём разборов (без абсолютных
// чисел: счётчик намеренно невидим). Кратность считаем от бюджета базового тарифа —
// так она честно отражает, во сколько раз больше можно разобрать, и сама подстроится
// при смене бюджетов в конфиге.
function volumeNote(budgetUsd: number, baseBudgetUsd: number): string {
  const mult = Math.round(budgetUsd / baseBudgetUsd);
  return mult <= 1 ? "Базовый объём" : `Объём × ${mult}`;
}

export default async function PricingPage() {
  const session = await getSession();
  const state = session ? await getSubscriptionState(session.playerId) : null;
  const currentPlan = state?.hasAccess ? state.planCode : null;
  const plans = getPlans();
  const baseBudget = getPlan("basic")?.monthlyBudgetUsd ?? 1;

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
            Первый турнир — бесплатно после регистрации. Дальше выбирай тариф по тому,
            как много играешь: возможности у всех одинаковые, разница — в объёме разборов.
          </p>
          <p className="text-small text-muted-foreground">
            Цены указаны в долларах. Оплата — в рублях по курсу ЦБ РФ на день платежа.
          </p>
        </div>

        <div className="mt-12 grid items-stretch gap-4 lg:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.code;

            let cta;
            if (!session) {
              // Гость: сначала регистрация, оплата — уже из кабинета/со страницы цен.
              cta = (
                <Link href="/register" className={cn(buttonVariants(), "w-full justify-center")}>
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
                priceLabel={formatUsd(plan.priceUsd)}
                volumeNote={volumeNote(plan.monthlyBudgetUsd, baseBudget)}
                cta={cta}
              />
            );
          })}
        </div>

        {/* Общий блок: что входит в ЛЮБОЙ тариф (одинаково для всех). */}
        <div className="mt-4 border border-border bg-card p-8">
          <h2 className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Входит в любой тариф
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

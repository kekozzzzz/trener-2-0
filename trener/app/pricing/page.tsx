import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { PricingCard } from "@/components/ui/pricing-card";

// Тарифы (цены и лимиты — бизнес-решение, согласовано; зафиксировано в
// .business/products/pricing.md). Тренировка = разбор и вопросы по ЛЮБОЙ
// раздаче турнира (не только ~10 карточным) — «учись на всех своих руках».
const PLANS = [
  {
    title: "Базовый",
    description: "Разбирай турниры и спрашивай «почему» по ключевым раздачам",
    price: 12,
    features: [
      {
        title: "Что входит",
        items: [
          "До 30 турниров в месяц",
          "~10 ключевых раздач за турнир",
          "Сократовский диалог по критическим раздачам",
          "Чат по любой раздаче карточки",
          "Общая картина турнира",
        ],
      },
    ],
  },
  {
    title: "Средний",
    description: "Учись на всех своих руках, а не только на ключевых",
    price: 27,
    features: [
      {
        title: "Всё из «Базового», плюс",
        items: [
          "До 70 турниров в месяц",
          "Тренировка: прокликивай свои решения по любой раздаче",
          "Мгновенная оценка каждого решения: верно / неверно",
        ],
      },
    ],
  },
  {
    title: "Максимальный",
    description: "Для тех, кто играет много и хочет разбирать всё",
    price: 40,
    features: [
      {
        title: "Всё из «Среднего», плюс",
        items: [
          "До 120 турниров в месяц",
          "Тренировка по всем раздачам базы",
          "Приоритет в очереди разбора",
        ],
      },
    ],
  },
];

export default function PricingPage() {
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
            как глубоко хочешь разбирать свою игру.
          </p>
        </div>

        <div className="mt-12 grid items-start gap-4 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <PricingCard
              key={plan.title}
              title={plan.title}
              description={plan.description}
              price={plan.price}
              features={plan.features}
              buttonText="Начать"
              buttonHref="/register"
            />
          ))}
        </div>
      </section>
    </main>
  );
}

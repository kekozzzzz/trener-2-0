import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";
import { PricingCard } from "@/components/ui/pricing-card";

export default function PricingPage() {
  return (
    <main>
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
          <Link href="/" className="font-mono text-label uppercase tracking-label text-foreground">
            Тренер 2.0
          </Link>
          <AuthNav />
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
        <div className="max-w-2xl space-y-6">
          <h1 className="text-h1">Тариф</h1>
          <PricingCard
            title="Базовый"
            description="Загружай турниры, разбирай раздачи, спрашивай «почему»"
            price={12}
            features={[
              {
                title: "Что входит",
                items: [
                  "До 20 турниров в месяц",
                  "~10 адаптивных раздач за сессию",
                  "Парсер VPIP, потерь в фишках, SPR",
                  "Сократовский диалог по каждой раздаче",
                ],
              },
            ]}
            buttonText="Загрузить турнир"
            buttonHref="/#upload"
          />
        </div>
      </section>
    </main>
  );
}

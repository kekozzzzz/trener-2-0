import Link from "next/link";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { indexable } from "@/lib/seo";
import { HandHistoryGuide } from "@/components/upload/hand-history-guide";

export const metadata = {
  ...indexable,
  title: "Как выгрузить руки",
  description:
    "Пошагово: как включить сохранение истории рук и найти файлы в GGPoker, PokerStars, Winamax, 888poker, ACR / PokerKing, Red Star Poker (iPoker) и BetOnline (Chico), чтобы загрузить турнир в Whygrid на разбор.",
};

export default function HowToExportPage() {
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
        <div className="max-w-2xl space-y-4">
          <h1 className="text-h1">Как выгрузить руки</h1>
          <p className="text-body text-muted-foreground">
            Разбор строится на файлах истории рук из твоего покер-клиента. Почти везде
            всё одинаково: один раз включаешь сохранение истории в настройках, находишь
            папку с файлами и загружаешь их к нам. Рум определится сам, ники соперников
            обезличиваются, первый разбор — бесплатный. Загрузить можно сразу несколько
            файлов. Выбери свой рум:
          </p>
        </div>

        <div className="mt-8">
          <HandHistoryGuide withToggle={false} />
        </div>

        <div className="mt-8 flex flex-col items-start gap-4 border border-border bg-card p-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body text-muted-foreground">
            Нашёл файлы — загрузи турнир, первый разбор бесплатный.
          </p>
          <Link href="/analyze" className={cn(buttonVariants(), "shrink-0")}>
            Загрузить турнир
          </Link>
        </div>
      </section>
    </main>
  );
}

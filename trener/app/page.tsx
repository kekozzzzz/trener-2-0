import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getCurrentPlayer } from "@/features/auth/queries";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { SiteFooter } from "@/components/site-footer";
import { BlurFade } from "@/components/ui/blur-fade";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    number: "/01",
    title: "Загрузи турнир",
    description:
      "Зарегистрируйся и скинь HH-файл GGPoker MTT — первый турнир разберём бесплатно. Парсер пройдёт по каждой раздаче.",
  },
  {
    number: "/02",
    title: "Тебя спросят «почему»",
    description:
      "По паре самых спорных раздач тренер спросит, почему ты сыграл именно так — прежде чем дать оценку.",
  },
  {
    number: "/03",
    title: "Увидь разрыв",
    description:
      "Сравнишь свой ответ с разбором — и сам увидишь, где твоя логика не совпала с тем, что случилось на столе.",
  },
];

// Сравнение с альтернативами: почему сервис, а не тренер/самообучение.
// Лайм-акцент (accent) — только на колонке сервиса (один сигнальный цвет, design-system.md §1).
const ALTERNATIVES = [
  {
    tag: "Личный тренер",
    verdict: "Слишком дорого",
    description: "$50+ в час — и мало кто возьмётся всерьёз разбирать микролимиты.",
    accent: false,
  },
  {
    tag: "Разбираться самому",
    verdict: "Легко ошибиться",
    description:
      "Можно не так понять, не найти ответ или принять чужую утечку за правило — и закрепить ошибку вместо того, чтобы убрать её.",
    accent: false,
  },
  {
    tag: "Whygrid",
    verdict: "от $12 в месяц",
    description:
      "Твои собственные раздачи. Парсер считает математику точно, а тренер ведёт вопросами — пока ты сам не увидишь, где слил.",
    accent: true,
  },
];

// Явные плюсы продукта — отдельный ряд на лендинге.
const BENEFITS = [
  {
    label: "Точные числа",
    title: "Парсер, а не угадайка",
    description: "VPIP, потери в фишках, позиция — считает детерминированный парсер. Числа всегда верные, ИИ их не выдумывает.",
  },
  {
    label: "Метод",
    title: "Вопрос, а не готовый ответ",
    description: "Тебя ведут к решению сократовскими вопросами — ты сам видишь ошибку и запоминаешь её, а не зубришь чужой совет.",
  },
  {
    label: "Твоя игра",
    title: "Разбор на твоих руках",
    description: "Не абстрактные споты из учебника, а конкретно те раздачи, которые ты сыграл сам.",
  },
];

// Лендинг видят все, включая залогиненных. Призыв адаптируется: гостя ведём в
// регистрацию, залогиненного — сразу в инструмент «Разбор» (/analyze).
export default async function HomePage() {
  const player = await getCurrentPlayer();

  return (
    <main>
      <BlurFade direction="up" offset={8} blur="0px" duration={0.3}>
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
            <Wordmark />
            <div className="flex items-center gap-4">
              <AuthNav />
            </div>
          </div>
        </header>
      </BlurFade>

      <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
        <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.05}>
          <div className="mx-auto flex max-w-2xl flex-col items-center space-y-6 text-center">
            <Badge variant="outline">Сократовский AI-тренер</Badge>
            {/* Резиновый размер: плавно от ~h1 на узком окне до display (4rem) на широком —
                чтобы заголовок не переполнял экран при сжатии окна, оставаясь по центру. */}
            <h1 className="font-black leading-[1.05] tracking-[-0.02em] text-balance text-[clamp(2.25rem,7vw,4rem)]">
              Перестань терять деньги на базовых ошибках
            </h1>
            <p className="text-body text-muted-foreground">
              Одни и те же утечки забирают у тебя не бай-ины, а деньги. Whygrid находит их
              в твоих собственных раздачах и доводит до того, чтобы ты сам понял, где
              ошибся, — а не просто запомнил чужой совет.
            </p>
            {player ? (
              <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                <Link href="/analyze" className={cn(buttonVariants(), "gap-2")}>
                  Загрузить турнир
                  <ArrowRight className="size-4" />
                </Link>
                <Link href="/tournaments" className={cn(buttonVariants({ variant: "outline" }))}>
                  Мои турниры
                </Link>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                  <Link href="/register" className={cn(buttonVariants(), "gap-2")}>
                    Загрузить турнир
                    <ArrowRight className="size-4" />
                  </Link>
                  <Link href="/login" className={cn(buttonVariants({ variant: "outline" }))}>
                    Войти
                  </Link>
                </div>
                <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
                  Попробуй бесплатно
                </p>
              </>
            )}
          </div>
        </BlurFade>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-8 py-16">
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.08}>
            <h2 className="text-h2 text-center">Почему не по-другому</h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-body text-muted-foreground">
              Ошибки в покере чинятся разбором. Вопрос только в том, каким.
            </p>
          </BlurFade>
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.12}>
            <div className="mt-8 grid divide-y divide-border border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {ALTERNATIVES.map((alt) => (
                <div key={alt.tag} className="p-8 text-center">
                  <p
                    className={cn(
                      "font-mono text-label uppercase tracking-label",
                      alt.accent ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {alt.tag}
                  </p>
                  <h3 className="mt-4 text-h3">{alt.verdict}</h3>
                  <p className="mt-2 text-small text-muted-foreground">{alt.description}</p>
                </div>
              ))}
            </div>
          </BlurFade>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-8 py-16">
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.08}>
            <h2 className="text-h2 text-center">Что ты получаешь</h2>
          </BlurFade>
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.12}>
            <div className="mt-8 grid divide-y divide-border border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {BENEFITS.map((benefit) => (
                <div key={benefit.label} className="p-8 text-center">
                  <p className="font-mono text-label uppercase tracking-label text-primary">
                    {benefit.label}
                  </p>
                  <h3 className="mt-4 text-h3">{benefit.title}</h3>
                  <p className="mt-2 text-small text-muted-foreground">{benefit.description}</p>
                </div>
              ))}
            </div>
          </BlurFade>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-8 py-16">
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.1}>
            <h2 className="text-h2 text-center">Как это работает</h2>
          </BlurFade>
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.15}>
            <div className="mt-8 grid divide-y divide-border border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {STEPS.map((step) => (
                <div key={step.number} className="p-8 text-center">
                  <p className="font-mono text-label uppercase tracking-label text-primary">
                    {step.number}
                  </p>
                  <h3 className="mt-4 text-h3">{step.title}</h3>
                  <p className="mt-2 text-small text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </BlurFade>
        </div>
      </section>

      <section className="border-t border-border">
        <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.1}>
          <div className="mx-auto flex max-w-2xl flex-col items-center space-y-6 px-8 py-16 text-center sm:py-24">
            <h2 className="text-h2">Всё это — от $12 в месяц</h2>
            <p className="text-body text-muted-foreground">
              Первый турнир разберём бесплатно. Это дешевле одного бай-ина, который ты теряешь
              на повторной ошибке.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Link
                href={player ? "/analyze" : "/register"}
                className={cn(buttonVariants(), "gap-2")}
              >
                Загрузить турнир
                <ArrowRight className="size-4" />
              </Link>
              <Link href="/pricing" className={cn(buttonVariants({ variant: "outline" }))}>
                Все тарифы
              </Link>
            </div>
          </div>
        </BlurFade>
      </section>

      <SiteFooter />
    </main>
  );
}

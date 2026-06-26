import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { indexable } from "@/lib/seo";
import { getCurrentPlayer } from "@/features/auth/queries";
import { getPlans, formatUsd } from "@/config/plans";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { SiteFooter } from "@/components/site-footer";
import { BlurFade } from "@/components/ui/blur-fade";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Лендинг — в белом списке индексации (заголовок и описание берёт из корневого layout).
export const metadata = indexable;

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
    tag: "Разовая консультация",
    verdict: "Дорого и без системы",
    description: "≈ $50 за разовый разбор. На микролимитах системно почти никто не разбирает.",
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
    verdict: "", // цена подставляется из конфига при рендере (accent-тариф)
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

// Отработка трёх возражений нашей аудитории (думающий микролимитник).
// Снимаем «дорого / не верю / сам разберусь» прямо на лендинге, перед призывом.
const OBJECTIONS = [
  {
    label: "«Дорого»",
    answer:
      "Дешевле одной разовой консультации. Один не слитый банк на дистанции окупает месяц подписки.",
  },
  {
    label: "«Не верю»",
    answer:
      "Не верь на слово. Загрузи турнир — первый разбор бесплатно, и суди по своим же раздачам.",
  },
  {
    label: "«Сам разберусь»",
    answer:
      "Теорию ты знаешь. Вопрос в том, видишь ли ты свои повторяющиеся утечки на дистанции в десятки турниров — их и показывает разбор.",
  },
];

// Лендинг видят все, включая залогиненных. Призыв адаптируется: гостя ведём в
// регистрацию, залогиненного — сразу в инструмент «Разбор» (/analyze).
export default async function HomePage() {
  const player = await getCurrentPlayer();
  // Цену на лендинге берём из конфига тарифов (правило 3: не хардкодим цены в разметке).
  const priceFrom = formatUsd(Math.min(...getPlans().map((p) => p.priceUsd)));
  const ctaHref = player ? "/analyze" : "/register";

  return (
    <main>
      <BlurFade direction="up" offset={8} blur="0px" duration={0.3}>
        <header className="border-b border-border">
          {/* Мобайл: вордмарк и навигация в две центрированные строки — гостевая и
              авторская навигация шире, чем влезает в одну строку на ≤375px, иначе
              шапка переполняется по горизонтали (CTA уезжает за край экрана).
              От sm — снова одна строка со space-between. */}
          <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:justify-between sm:px-8">
            <Wordmark />
            <AuthNav />
          </div>
        </header>
      </BlurFade>

      {/* HERO — текст слева, живая карточка разбора справа (показываем продукт, а не
          описываем словами; design-system.md §6: героическая единица — данные, не фото). */}
      <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.05}>
            <div className="flex flex-col items-center space-y-6 text-center lg:items-start lg:text-left">
              <Badge variant="outline">Сократовский AI-тренер</Badge>
              {/* Резиновый размер: плавно от ~h1 на узком окне до display (4rem) на широком. */}
              <h1 className="font-black leading-[1.05] tracking-[-0.02em] text-balance text-[clamp(2.25rem,6vw,3.75rem)]">
                Перестань терять деньги на одних и тех же ошибках
              </h1>
              <p className="text-body text-muted-foreground">
                Одни и те же утечки повторяются из турнира в турнир и стоят тебе реальных
                денег. Whygrid находит их в твоих раздачах и вопросами доводит до того, чтобы
                ты сам увидел, где слил, — а не запомнил чужой совет.
              </p>
              <div className="flex flex-col items-center gap-3 pt-2 lg:items-start">
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <Link href={ctaHref} className={cn(buttonVariants(), "gap-2")}>
                    Загрузить турнир
                    <ArrowRight className="size-4" />
                  </Link>
                  <Link
                    href={player ? "/tournaments" : "/login"}
                    className={cn(buttonVariants({ variant: "outline" }))}
                  >
                    {player ? "Мои турниры" : "Войти"}
                  </Link>
                </div>
                {!player && (
                  <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
                    Без карты — первый турнир разбираем бесплатно
                  </p>
                )}
              </div>
            </div>
          </BlurFade>

          {/* Карточка разбора — иллюстративная, в духе реального продукта. */}
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.1}>
            <HandPreview />
          </BlurFade>
        </div>
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
                  <h3 className="mt-4 text-h3">
                    {alt.accent ? `от ${priceFrom} в месяц` : alt.verdict}
                  </h3>
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

      {/* Отработка возражений — снимаем сомнения перед финальным призывом. */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-8 py-16">
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.08}>
            <h2 className="text-h2 text-center">Если сомневаешься</h2>
          </BlurFade>
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.12}>
            <div className="mt-8 grid divide-y divide-border border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {OBJECTIONS.map((item) => (
                <div key={item.label} className="p-8">
                  <p className="font-mono text-label uppercase tracking-label text-primary">
                    {item.label}
                  </p>
                  <p className="mt-4 text-body text-muted-foreground">{item.answer}</p>
                </div>
              ))}
            </div>
          </BlurFade>
        </div>
      </section>

      <section className="border-t border-border">
        <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.1}>
          <div className="mx-auto flex max-w-2xl flex-col items-center space-y-6 px-8 py-16 text-center sm:py-24">
            <h2 className="text-h2">Перестань повторять одни и те же ошибки</h2>
            <p className="text-body text-muted-foreground">
              Первый турнир разберём бесплатно. Загрузи свой HH-файл — и сам увидишь, где
              сливаешь фишки, пока тренер ведёт тебя вопросами.
            </p>
            <div className="flex flex-col items-center gap-3 pt-2">
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link href={ctaHref} className={cn(buttonVariants(), "gap-2")}>
                  Загрузить турнир
                  <ArrowRight className="size-4" />
                </Link>
                <Link href="/pricing" className={cn(buttonVariants({ variant: "outline" }))}>
                  Все тарифы
                </Link>
              </div>
              {!player && (
                <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
                  Без карты — первый турнир разбираем бесплатно
                </p>
              )}
            </div>
          </div>
        </BlurFade>
      </section>

      <SiteFooter />
    </main>
  );
}

// Иллюстративная карточка разбора для hero. Не настоящие данные пользователя — показывает
// форму продукта: спот → сократовский вопрос → числа парсера. Числа в JetBrains Mono
// (design-system.md §2), ключевые — акцентным лаймом. Некликабельная: без hover-состояния.
function HandPreview() {
  return (
    <div className="border border-border bg-card p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
          Разбор раздачи
        </p>
        <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
          MTT · поздняя стадия
        </p>
      </div>

      <div className="mt-6 space-y-2 text-small text-muted-foreground">
        <p>
          <span className="font-mono text-foreground">40 ББ</span> в стеке, у тебя{" "}
          <span className="font-mono text-foreground">AJ</span> на баттоне. 3-бет, ББ коллит.
        </p>
        <p>
          Флоп <span className="font-mono text-foreground">K 9 4</span> · тёрн{" "}
          <span className="font-mono text-foreground">7</span> · ривер{" "}
          <span className="font-mono text-foreground">Q</span>. Оппонент ставит весь банк.
          Ты коллишь.
        </p>
      </div>

      {/* Сердце продукта — вопрос предшествует оценке. Акцент лаймом. */}
      <div className="mt-6 border-l-2 border-primary pl-4">
        <p className="font-mono text-label uppercase tracking-label text-primary">
          Вопрос тренера
        </p>
        <p className="mt-2 text-body text-foreground">
          За что ты заплатил на ривере? Какие руки оппонента ты здесь бьёшь?
        </p>
      </div>

      {/* Числа парсера — детерминированно, не выдумано ИИ. */}
      <div className="mt-6 grid grid-cols-2 gap-px border border-border bg-border">
        <div className="bg-card p-4">
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Потеря в раздаче
          </p>
          <p className="mt-2 font-mono text-h3 text-primary">−18 ББ</p>
        </div>
        <div className="bg-card p-4">
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Похожих решений за турнир
          </p>
          <p className="mt-2 font-mono text-h3 text-foreground">4</p>
        </div>
      </div>
    </div>
  );
}

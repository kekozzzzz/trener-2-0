import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
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
import { HandTable } from "@/components/poker/hand-table";
import type { TableState } from "@/parser/table-state";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import { buildRange } from "@/config/poker/hand-range";

// Лендинг — в белом списке индексации (заголовок и описание берёт из корневого layout).
export const metadata = indexable;

// Лендинг видят все, включая залогиненных. Призыв адаптируется: гостя ведём в
// регистрацию, залогиненного — сразу в инструмент «Разбор» (/analyze).
export default async function HomePage() {
  const t = await getTranslations("Landing");
  const player = await getCurrentPlayer();
  // Цену на лендинге берём из конфига тарифов (правило 3: не хардкодим цены в разметке).
  const priceFrom = formatUsd(Math.min(...getPlans().map((p) => p.priceUsd)));
  // Гостя обе кнопки ведут на /enter — вход по ссылке первым (пароль — запасной путь).
  const ctaHref = player ? "/analyze" : "/enter";

  const STEPS = [
    { number: "/01", title: t("step1Title"), description: t("step1Description") },
    { number: "/02", title: t("step2Title"), description: t("step2Description") },
    { number: "/03", title: t("step3Title"), description: t("step3Description") },
  ];

  // Сравнение с альтернативами: почему сервис, а не тренер/самообучение.
  // Лайм-акцент (accent) — только на колонке сервиса (один сигнальный цвет, design-system.md §1).
  const ALTERNATIVES = [
    {
      tag: t("altConsultationTag"),
      verdict: t("altConsultationVerdict"),
      description: t("altConsultationDescription"),
      accent: false,
    },
    {
      tag: t("altSelfTag"),
      verdict: t("altSelfVerdict"),
      description: t("altSelfDescription"),
      accent: false,
    },
    {
      tag: t("altWhygridTag"),
      verdict: "", // цена подставляется из конфига при рендере (accent-тариф)
      description: t("altWhygridDescription"),
      accent: true,
    },
  ];

  // Явные плюсы продукта — отдельный ряд на лендинге.
  const BENEFITS = [
    {
      label: t("benefitNumbersLabel"),
      title: t("benefitNumbersTitle"),
      description: t("benefitNumbersDescription"),
    },
    {
      label: t("benefitMethodLabel"),
      title: t("benefitMethodTitle"),
      description: t("benefitMethodDescription"),
    },
    {
      label: t("benefitGameLabel"),
      title: t("benefitGameTitle"),
      description: t("benefitGameDescription"),
    },
  ];

  // Отработка трёх возражений нашей аудитории (думающий микролимитник).
  // Снимаем «дорого / не верю / сам разберусь» прямо на лендинге, перед призывом.
  const OBJECTIONS = [
    { label: t("objectionExpensiveLabel"), answer: t("objectionExpensiveAnswer") },
    { label: t("objectionDoubtLabel"), answer: t("objectionDoubtAnswer") },
    { label: t("objectionSelfLabel"), answer: t("objectionSelfAnswer") },
  ];

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
              <Badge variant="outline">{t("badge")}</Badge>
              {/* Резиновый размер: плавно от ~h1 на узком окне до display (4rem) на широком. */}
              <h1 className="font-black leading-[1.05] tracking-[-0.02em] text-balance text-[clamp(2.25rem,6vw,3.75rem)]">
                {t("heroTitle")}
              </h1>
              <p className="text-body text-muted-foreground">
                {t("heroSubtitle")}
              </p>
              <div className="flex flex-col items-center gap-3 pt-2 lg:items-start">
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <Link href={ctaHref} className={cn(buttonVariants(), "gap-2")}>
                    {t("ctaUpload")}
                    <ArrowRight className="size-4" />
                  </Link>
                  <Link
                    href={player ? "/tournaments" : "/enter"}
                    className={cn(buttonVariants({ variant: "outline" }))}
                  >
                    {player ? t("myTournaments") : t("signIn")}
                  </Link>
                </div>
                {!player && (
                  <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
                    {t("freeFirstNote")}
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

      <ProductShowcase />

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-8 py-16">
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.08}>
            <h2 className="text-h2 text-center">{t("alternativesTitle")}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-body text-muted-foreground">
              {t("alternativesSubtitle")}
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
                    {alt.accent ? t("altWhygridPrice", { price: priceFrom }) : alt.verdict}
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
            <h2 className="text-h2 text-center">{t("benefitsTitle")}</h2>
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
            <h2 className="text-h2 text-center">{t("howTitle")}</h2>
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
            <h2 className="text-h2 text-center">{t("objectionsTitle")}</h2>
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
            <h2 className="text-h2">{t("finalTitle")}</h2>
            <p className="text-body text-muted-foreground">
              {t("finalSubtitle")}
            </p>
            <div className="flex flex-col items-center gap-3 pt-2">
              <div className="flex flex-wrap items-center justify-center gap-4">
                <Link href={ctaHref} className={cn(buttonVariants(), "gap-2")}>
                  {t("ctaUpload")}
                  <ArrowRight className="size-4" />
                </Link>
                <Link href="/pricing" className={cn(buttonVariants({ variant: "outline" }))}>
                  {t("allPlans")}
                </Link>
              </div>
              {!player && (
                <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
                  {t("freeFirstNote")}
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

// ── Витрина продукта (QA 2026-07-05, п.16): настоящие экраны, а не описания. ───
// Демо-раздача для стола: реальный спот (карманные пятёрки против олл-ина BTN
// на префлопе — короткий стек), обезличенный. Числа сходятся с вердиктом витрины:
// цена колла ~44% (колл 14bb в банк 17.8bb), диапазон пуша 20-25%.
// Рендерится ТЕМ ЖЕ компонентом HandTable, что и в разборе.
const DEMO_BB = 250;
const DEMO_TABLE: TableState = {
  tableSize: 8,
  buttonSeat: 6,
  heroCards: ["5s", "5h"],
  board: [],
  potSoFar: 17.8 * DEMO_BB,
  bigBlind: DEMO_BB,
  smallBlind: 125,
  ante: 35,
  level: 5,
  street: "PREFLOP",
  decisionActor: "Player 5",
  playersAfterHero: 0,
  seats: [
    { label: "Player 1", position: "EARLY", positionName: "UTG", startingStack: 60 * DEMO_BB, remainingStack: 60 * DEMO_BB, seatNumber: 1, isHero: false, folded: true, isCurrent: false, streetBet: 0, lastAction: { action: "FOLD" } },
    { label: "Player 2", position: "EARLY", positionName: "UTG+1", startingStack: 88 * DEMO_BB, remainingStack: 88 * DEMO_BB, seatNumber: 2, isHero: false, folded: true, isCurrent: false, streetBet: 0, lastAction: { action: "FOLD" } },
    { label: "Player 3", position: "EARLY", positionName: "LJ", startingStack: 41 * DEMO_BB, remainingStack: 41 * DEMO_BB, seatNumber: 3, isHero: false, folded: true, isCurrent: false, streetBet: 0, lastAction: { action: "FOLD" } },
    { label: "Player 4", position: "HJ", positionName: "HJ", startingStack: 25 * DEMO_BB, remainingStack: 25 * DEMO_BB, seatNumber: 4, isHero: false, folded: true, isCurrent: false, streetBet: 0, lastAction: { action: "FOLD" } },
    { label: "Player 7", position: "CO", positionName: "CO", startingStack: 52 * DEMO_BB, remainingStack: 52 * DEMO_BB, seatNumber: 5, isHero: false, folded: true, isCurrent: false, streetBet: 0, lastAction: { action: "FOLD" } },
    { label: "Player 5", position: "BTN", positionName: "BTN", startingStack: 15 * DEMO_BB, remainingStack: 0, seatNumber: 6, isHero: false, folded: false, isCurrent: true, streetBet: 15 * DEMO_BB, lastAction: { action: "ALL_IN", amount: 15 * DEMO_BB } },
    { label: "Player 6", position: "SB", positionName: "SB", startingStack: 33 * DEMO_BB, remainingStack: 33 * DEMO_BB, seatNumber: 7, isHero: false, folded: true, isCurrent: false, streetBet: 0, lastAction: { action: "FOLD" } },
    { label: "Hero", position: "BB", positionName: "BB", startingStack: 34 * DEMO_BB, remainingStack: 33 * DEMO_BB, seatNumber: 8, isHero: true, folded: false, isCurrent: false, streetBet: 1 * DEMO_BB, lastAction: null },
  ],
};

// Отмеченный диапазон для витринной сетки — реальная отметка игрока (широкий опен BTN).
const DEMO_RANGE = buildRange([
  "22+", "A2s+", "K2s+", "Q4s+", "J5s+", "T6s+", "96s+", "85s+", "74s+", "63s+", "52s+", "42s+",
  "A2o+", "K6o+", "Q7o+", "J8o+", "T8o+", "98o",
]);
const DEMO_GRID_SIZE = GRID_RANKS.length;

// Статичная мини-сетка 13x13 (без интерактива): как выглядит ответ диапазоном.
function DemoRangeGrid() {
  return (
    <div
      className="grid w-full max-w-[360px] select-none gap-px"
      style={{ gridTemplateColumns: `repeat(${DEMO_GRID_SIZE}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: DEMO_GRID_SIZE }).map((_, row) =>
        Array.from({ length: DEMO_GRID_SIZE }).map((__, col) => {
          const code = cellCode(row, col);
          const on = DEMO_RANGE.has(code);
          return (
            <div
              key={code}
              className={cn(
                "flex aspect-square items-center justify-center border font-mono leading-none",
                on ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground/40"
              )}
            >
              <span className="text-[0.45rem] sm:text-[0.55rem]">{code}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

async function ProductShowcase() {
  const t = await getTranslations("Landing");
  return (
    <section className="border-t border-border bg-background">
      <div className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl space-y-4 text-center">
          <h2 className="text-h1">{t("showcaseTitle")}</h2>
          <p className="text-body text-muted-foreground">{t("showcaseSubtitle")}</p>
        </div>

        <div className="mx-auto mt-12 max-w-2xl">
          <HandTable state={DEMO_TABLE} nick={null} />
          <p className="mt-3 font-mono text-label uppercase tracking-label text-muted-foreground">
            {t("showcaseTableCaption")}
          </p>
        </div>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <div>
            <DemoRangeGrid />
            <p className="mt-3 max-w-[360px] font-mono text-label uppercase tracking-label text-muted-foreground">
              {t("showcaseGridCaption")}
            </p>
          </div>
          <div className="border border-primary bg-card p-6">
            <p className="font-mono text-label uppercase tracking-label text-primary">
              {t("showcaseVerdictLabel")}
            </p>
            <p className="mt-3 text-body text-foreground">{t("showcaseVerdictText")}</p>
            <p className="mt-4 font-mono text-label uppercase tracking-label text-muted-foreground">
              {t("showcaseVerdictNote")}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

async function HandPreview() {
  const t = await getTranslations("Landing");

  return (
    <div className="border border-border bg-card p-6 sm:p-8">
      <div className="flex items-center justify-between">
        <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {t("previewHandTitle")}
        </p>
        <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {t("previewHandStage")}
        </p>
      </div>

      <div className="mt-6 space-y-2 text-small text-muted-foreground">
        <p>
          <span className="font-mono text-foreground">{t("previewSituationStack")}</span>
          {t("previewSituationLine1Suffix")}
          <span className="font-mono text-foreground">{t("previewSituationHand")}</span>
          {t("previewSituationLine1End")}
        </p>
        <p>
          {t("previewSituationFlopLabel")}<span className="font-mono text-foreground">K♦ 9♠ 4♦</span>
          {t("previewSituationTurnLabel")}<span className="font-mono text-foreground">7♣</span>
          {t("previewSituationRiverLabel")}<span className="font-mono text-foreground">Q♦</span>
          {t("previewSituationLine2End")}
        </p>
      </div>

      {/* Сердце продукта — вопрос предшествует оценке. Акцент лаймом. */}
      <div className="mt-6 border-l-2 border-primary pl-4">
        <p className="font-mono text-label uppercase tracking-label text-primary">
          {t("previewCoachLabel")}
        </p>
        <p className="mt-2 text-body text-foreground">
          {t("previewCoachQuestion")}
        </p>
      </div>

      {/* Числа парсера — детерминированно, не выдумано ИИ. */}
      <div className="mt-6 grid grid-cols-2 gap-px border border-border bg-border">
        <div className="bg-card p-4">
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            {t("previewLossLabel")}
          </p>
          <p className="mt-2 font-mono text-h3 text-primary">{t("previewLossValue")}</p>
        </div>
        <div className="bg-card p-4">
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            {t("previewSimilarLabel")}
          </p>
          <p className="mt-2 font-mono text-h3 text-foreground">4</p>
        </div>
      </div>
    </div>
  );
}

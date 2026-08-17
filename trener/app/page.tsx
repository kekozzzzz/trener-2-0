import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowRight, Check } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { indexablePage } from "@/lib/seo";
import { getCurrentPlayer } from "@/features/auth/queries";
import { getPlans, formatUsd } from "@/config/plans";
import { ROOM_SHORT_NAMES } from "@/config/rooms";
import { REFERENCE_CHART_COUNT } from "@/config/poker/reference-charts";
import { HEADLINE_VARIANT_COOKIE, isHeadlineVariant, type HeadlineVariant } from "@/config/growth";
import { HeadlineImpression } from "@/components/site/headline-impression";
import { HeadlineCtaLink } from "@/components/site/headline-cta-link";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { StructuredData } from "@/components/structured-data";
import { SiteFooter } from "@/components/site-footer";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { HandTable } from "@/components/poker/hand-table";
import { ScaleToFit } from "@/components/scale-to-fit";
import type { TableState } from "@/parser/table-state";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import { buildRange } from "@/config/poker/hand-range";
import { StatusBar } from "@/components/site/status-bar";
import { Ticker } from "@/components/site/ticker";
import { Reveal } from "@/components/site/reveal";
import { Sparkline } from "@/components/site/sparkline";
import { TicketCta } from "@/components/site/ticket-cta";
import { Tilt } from "@/components/site/tilt";
import { HeroDemo } from "@/components/site/hero-demo";
import { Backdrop } from "@/components/site/backdrop";
import {
  Bento,
  BentoCell,
  BigWordmark,
  ChatLine,
  Chips,
  CornerMarks,
  FigureCaption,
  ProductWindow,
  SectionHead,
  StatRow,
  Tile,
  TileRow,
} from "@/components/site/detail";

// Лендинг — в белом списке индексации (заголовок и описание берёт из корневого layout).
// canonical «/» склеивает http/https/www-дубли главной на один адрес.
export const metadata = indexablePage("/");

// Плотная вёрстка — design/design-system.md §4.1 (решение Артёма 2026-08-08):
// служебная моно-мелочь, крупные числа, окна продукта, бенто и рельс вместо пяти
// одинаковых секций «заголовок по центру + три карточки». Макет — design/landing-v2.html.
//
// Лендинг видят все, включая залогиненных. Призыв адаптируется: гостя ведём в
// регистрацию, залогиненного — сразу в инструмент «Разбор» (/analyze).
export default async function HomePage() {
  const t = await getTranslations("Landing");
  const player = await getCurrentPlayer();
  // Цену на лендинге берём из конфига тарифов (правило 3: не хардкодим цены в разметке).
  const priceFrom = formatUsd(Math.min(...getPlans().map((p) => p.priceUsd)));
  // Гостя обе кнопки ведут на /enter — вход по ссылке первым (пароль — запасной путь).
  const ctaHref = player ? "/analyze" : "/enter";

  // A/B-тест заголовка hero (config/growth.ts): вариант назначает middleware при первом
  // заходе и кладёт в куку — здесь только читаем, ничего не решаем и не пишем.
  const cookieJar = await cookies();
  const rawHeadlineVariant = cookieJar.get(HEADLINE_VARIANT_COOKIE)?.value;
  const headlineVariant: HeadlineVariant = isHeadlineVariant(rawHeadlineVariant)
    ? rawHeadlineVariant
    : "A";

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

  // На чём основан разбор — довод доверия перед возражениями (числа от кода, норма от
  // открытых чартов, роль ИИ). Ответ на вопрос тестера «на чём основано / кто решил».
  const BASIS: {
    label: string;
    title: string;
    description: string;
    linkHref?: string;
    linkText?: string;
  }[] = [
    { label: t("basisNumbersLabel"), title: t("basisNumbersTitle"), description: t("basisNumbersDescription") },
    {
      label: t("basisChartsLabel"),
      title: t("basisChartsTitle"),
      description: t("basisChartsDescription"),
      linkHref: "/charts",
      linkText: t("basisChartsLink"),
    },
    { label: t("basisCoachLabel"), title: t("basisCoachTitle"), description: t("basisCoachDescription") },
  ];

  // Отработка трёх возражений нашей аудитории (думающий микролимитник).
  // Снимаем «дорого / не верю / сам разберусь» прямо на лендинге, перед призывом.
  const OBJECTIONS = [
    { label: t("objectionExpensiveLabel"), answer: t("objectionExpensiveAnswer") },
    { label: t("objectionDoubtLabel"), answer: t("objectionDoubtAnswer") },
    { label: t("objectionSelfLabel"), answer: t("objectionSelfAnswer") },
  ];

  return (
    <main className="relative">
      {/* Общий фон страницы: сетка, крестики на узлах, два источника света */}
      <Backdrop />
      <StructuredData />
      <StatusBar />

      <header className="border-b border-border">
        {/* Мобайл: вордмарк и навигация в две центрированные строки — гостевая и
            авторская навигация шире, чем влезает в одну строку на ≤375px, иначе
            шапка переполняется по горизонтали (CTA уезжает за край экрана).
            От sm — снова одна строка со space-between. */}
        <div className="mx-auto flex site-wrap flex-col items-center gap-4 px-4 py-6 sm:flex-row sm:justify-between sm:px-8">
          <Wordmark />
          <AuthNav />
        </div>
      </header>

      {/* HERO — текст слева, живая карточка разбора справа (показываем продукт, а не
          описываем словами; design-system.md §6: героическая единица — данные, не фото).
          Первый экран не анимируется по скроллу — он и так виден при загрузке (§5 п. 4).
          Сетка и свет живут в общем фоне страницы (<Backdrop/>), здесь только
          технические подписи по углам — с проверяемыми числами из конфига. */}
      <section className="relative overflow-hidden border-b border-border">
        <span className="hero-corner left-8 top-4">{t("heroCornerBrand")}</span>
        <span className="hero-corner right-8 top-4">
          {t("heroCornerRooms", { count: ROOM_SHORT_NAMES.length })}
        </span>
        <span className="hero-corner bottom-4 left-8">{t("heroCornerSection")}</span>
        <span className="hero-corner bottom-4 right-8">
          {t("heroCornerCharts", { count: REFERENCE_CHART_COUNT })}
        </span>

        <div className="relative mx-auto grid site-wrap items-center gap-12 px-8 py-16 sm:py-24 lg:grid-cols-[1fr_minmax(0,34rem)] 2xl:gap-20">
          <div className="flex flex-col items-center space-y-6 text-center lg:items-start lg:text-left">
            <Badge variant="outline">{t("badge")}</Badge>
            {/* Резиновый размер: плавно от ~h1 на узком окне до display (4rem) на широком.
                Ключевые слова акцентом — «твои раздачи» и есть предмет продажи. */}
            <h1 className="font-black leading-[1.05] tracking-[-0.02em] text-balance text-[clamp(2.25rem,5vw,4.75rem)]">
              {headlineVariant === "B" ? (
                <>
                  {t("heroTitleBeforeB")}
                  <span className="text-primary">{t("heroTitleAccentB")}</span>
                  {t("heroTitleAfterB")}
                </>
              ) : (
                <>
                  {t("heroTitleBefore")}
                  <span className="text-primary">{t("heroTitleAccent")}</span>
                  {t("heroTitleAfter")}
                </>
              )}
            </h1>
            <HeadlineImpression variant={headlineVariant} />
            <p className="text-body text-muted-foreground">{t("heroSubtitle")}</p>
            <div className="flex flex-col items-center gap-3 pt-2 lg:items-start">
              <div className="flex flex-wrap items-center justify-center gap-4">
                <HeadlineCtaLink
                  href={ctaHref}
                  variant={headlineVariant}
                  className={cn(buttonVariants(), "gap-2")}
                >
                  {t("ctaUpload")}
                  <ArrowRight className="size-4" />
                </HeadlineCtaLink>
                <Link
                  href={player ? "/tournaments" : "/enter"}
                  className={cn(buttonVariants({ variant: "outline" }))}
                >
                  {player ? t("myTournaments") : t("signIn")}
                </Link>
              </div>
              {/* Значки-подсказки под CTA: снимают трение до клика (нет пароля/карты,
                  первый разбор бесплатен) и сами ведут туда же, куда основная кнопка —
                  весь ряд обёрнут в одну ссылку, а не три одинаковых рядом (§8 деталей
                  плотности переиспользован под кликабельный вариант). */}
              {!player && (
                <Link href={ctaHref} className="group flex flex-wrap items-center gap-2">
                  {[t("heroBadgeNoPassword"), t("heroBadgeNoCard"), t("heroBadgeFreeFirst")].map(
                    (label) => (
                      <span
                        key={label}
                        className="flex items-center gap-1.5 border border-border px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-label text-foreground transition-colors group-hover:border-primary"
                      >
                        <Check className="size-3 text-primary" />
                        {label}
                      </span>
                    )
                  )}
                </Link>
              )}
            </div>

            {/* Статичный список румов — лента внизу его лишь повторяет (§5 п. 5:
                бегущая строка не может быть единственным носителем информации). */}
            <div className="w-full border-t border-border pt-4">
              <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
                {t("roomsLine")}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                {ROOM_SHORT_NAMES.map((room) => (
                  <span key={room} className="font-mono text-[0.6875rem] uppercase text-[#6E6E6E]">
                    {room}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <HandPreview />
        </div>
      </section>

      <Ticker items={ROOM_SHORT_NAMES.map((r) => r.toUpperCase())} highlight={t("tickerHighlight")} />

      {/* Крупные числа — только проверяемое: число открытых чартов из конфига,
          цена из тарифов. «0» — правило 1 проекта: модель не считает метрики. */}
      <Reveal>
        <div className="mx-auto site-wrap border-b border-border">
          <StatRow
            items={[
              { value: String(REFERENCE_CHART_COUNT), caption: t("statChartsCaption"), accent: true },
              { value: t("statZeroValue"), caption: t("statZeroCaption") },
              { value: priceFrom, caption: t("statPriceCaption") },
              { value: t("statFirstValue"), caption: t("statFirstCaption") },
            ]}
          />
        </div>
      </Reveal>

      <ProductShowcase />

      <section className="border-t border-border">
        <div className="mx-auto site-wrap px-8 py-16">
          <Reveal>
            <SectionHead
              tag={t("secAlternativesTag")}
              title={t("alternativesTitle")}
              note={t("secAlternativesNote")}
            />
            <p className="-mt-6 mb-8 max-w-2xl text-body text-muted-foreground">
              {t("alternativesSubtitle")}
            </p>
          </Reveal>
          <Reveal delay={60}>
            <TileRow>
              {ALTERNATIVES.map((alt) => (
                <Tile
                  key={alt.tag}
                  label={alt.tag}
                  accent={alt.accent}
                  title={alt.accent ? t("altWhygridPrice", { price: priceFrom }) : alt.verdict}
                >
                  <p className="mt-2 text-small text-muted-foreground">{alt.description}</p>
                </Tile>
              ))}
            </TileRow>
          </Reveal>
        </div>
      </section>

      {/* Что получаешь — бенто вместо трёх одинаковых карточек (§4.1 п. 6) */}
      <section className="border-t border-border">
        <div className="mx-auto site-wrap px-8 py-16">
          <Reveal>
            <SectionHead tag={t("secValueTag")} title={t("benefitsTitle")} note={t("secValueNote")} />
          </Reveal>
          <Reveal delay={60}>
            <Bento>
              <BentoCell label={t("benefitNumbersLabel")} title={t("benefitNumbersTitle")} span={4}>
                <p className="mt-2 text-small text-muted-foreground">
                  {t("benefitNumbersDescription")}
                </p>
                <Chips
                  items={[
                    { text: t("chipVpip"), on: true },
                    { text: t("chipPfr"), on: true },
                    { text: t("chip3bet") },
                    { text: t("chipPotOdds") },
                    { text: t("chipEquity") },
                    { text: t("chipSpr") },
                    { text: t("chipOuts") },
                    { text: t("chipPosition") },
                    { text: t("chipIcm") },
                  ]}
                />
              </BentoCell>

              <BentoCell label={t("benefitMethodLabel")} title={t("benefitMethodTitle")}>
                <p className="mt-2 text-small text-muted-foreground">
                  {t("benefitMethodDescription")}
                </p>
              </BentoCell>

              <BentoCell label={t("benefitGameLabel")} title={t("benefitGameTitle")}>
                <p className="mt-2 text-small text-muted-foreground">{t("benefitGameDescription")}</p>
              </BentoCell>

              <BentoCell
                label={t("basisChartsLabel")}
                title={t("chartsTitle", { count: REFERENCE_CHART_COUNT })}
                span={4}
              >
                <p className="mt-2 text-small text-muted-foreground">{t("chartsDescription")}</p>
                <Chips
                  items={[
                    { text: t("chipRfi") },
                    { text: t("chipPushFold") },
                    { text: t("chipBbDefense") },
                    { text: t("chipVsOpen") },
                    { text: t("chipResteal") },
                    { text: t("chipIso") },
                    { text: t("chipSqueeze") },
                    { text: t("chipBvb") },
                    { text: t("chip4bet") },
                    { text: t("chipSbLimp") },
                  ]}
                />
              </BentoCell>
            </Bento>
          </Reveal>
        </div>
      </section>

      {/* Как это работает — те же плитки, что и в остальных рядах */}
      <section className="border-t border-border">
        <div className="mx-auto site-wrap px-8 py-16">
          <Reveal>
            <SectionHead tag={t("secProcessTag")} title={t("howTitle")} note={t("secProcessNote")} />
          </Reveal>
          <Reveal delay={60}>
            <TileRow>
              {STEPS.map((step) => (
                <Tile key={step.number} label={step.number} title={step.title} accent>
                  <p className="mt-2 text-small text-muted-foreground">{step.description}</p>
                </Tile>
              ))}
            </TileRow>
          </Reveal>
        </div>
      </section>

      {/* Разговор — показываем метод, а не описываем его словами */}
      <section className="border-t border-border">
        <div className="mx-auto site-wrap px-8 py-16">
          <Reveal>
            <SectionHead
              tag={t("secDialogTag")}
              title={t("secDialogTitle")}
              note={t("secDialogNote")}
            />
          </Reveal>
          <Reveal delay={60}>
            <ProductWindow path={t("windowPathChat")}>
              <div className="grid gap-px bg-border">
                <ChatLine who={t("dialogCoach")} coach>
                  {t("previewCoachQuestion")}
                </ChatLine>
                <ChatLine who={t("dialogYou")}>{t("dialogAnswer")}</ChatLine>
                <ChatLine who={t("dialogCoach")} coach>
                  {t("dialogReply")}
                </ChatLine>
              </div>
            </ProductWindow>
          </Reveal>
        </div>
      </section>

      {/* На чём основан разбор — доверие перед возражениями: числа от кода, норма от
          открытых чартов, роль ИИ. Отвечает на вопрос «на чём основано / кто решил».
          id — якорь для ссылки со страницы-примера (/example). */}
      <section id="basis" className="border-t border-border">
        <div className="mx-auto site-wrap px-8 py-16">
          <Reveal>
            <SectionHead tag={t("secBasisTag")} title={t("basisTitle")} note={t("secBasisNote")} />
          </Reveal>
          <Reveal delay={60}>
            <TileRow>
              {BASIS.map((item, i) => (
                <Tile key={item.label} label={`0${i + 1} — ${item.label}`} title={item.title} accent>
                  <p className="mt-2 text-small text-muted-foreground">{item.description}</p>
                  {item.linkHref && (
                    <Link
                      href={item.linkHref}
                      className="mt-4 inline-flex items-center gap-1 font-mono text-label uppercase tracking-label text-primary transition-colors hover:text-foreground"
                    >
                      {item.linkText}
                      <ArrowRight className="size-3" />
                    </Link>
                  )}
                </Tile>
              ))}
            </TileRow>
          </Reveal>
          <Reveal delay={120}>
            <p className="mt-8 max-w-[80ch] text-small text-muted-foreground">{t("basisAudience")}</p>
          </Reveal>
        </div>
      </section>

      {/* Возражения — раскрывашки на нативном <details>: без клиентского JS,
          доступно с клавиатуры (тот же приём, что в гайде загрузки). */}
      <section className="border-t border-border">
        <div className="mx-auto site-wrap px-8 py-16">
          <Reveal>
            <SectionHead
              tag={t("secObjectionsTag")}
              title={t("objectionsTitle")}
              note={t("secObjectionsNote")}
            />
          </Reveal>
          <Reveal delay={60}>
            <div>
              {OBJECTIONS.map((item, i) => (
                <details key={item.label} className="group border-b border-border" open={i === 0}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 text-h3 [&::-webkit-details-marker]:hidden">
                    {item.label}
                    <span
                      aria-hidden
                      className="font-mono text-h3 text-primary group-open:hidden"
                    >
                      +
                    </span>
                    <span
                      aria-hidden
                      className="hidden font-mono text-h3 text-primary group-open:inline"
                    >
                      −
                    </span>
                  </summary>
                  {/* Плавное раскрытие на чистом CSS: grid-rows 0fr → 1fr. Работает
                      без единой строчки JS, поэтому <details> остаётся доступным
                      с клавиатуры и раскрытым для поисковика. */}
                  <div className="acc-body">
                    <div>
                      <p className="max-w-[80ch] pb-6 text-body text-muted-foreground">
                        {item.answer}
                      </p>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* Вторая (и последняя) лента страницы — вопросы тренера. Бежит навстречу
          первой. Смысл: перед кнопкой человек читает не лозунг, а то, что его
          реально спросят. */}
      <Ticker
        direction="right"
        items={[
          t("tickerQ1"),
          t("tickerQ2"),
          t("tickerQ3"),
          t("tickerQ4"),
          t("tickerQ5"),
          t("tickerQ6"),
          t("tickerQ7"),
        ]}
        highlight={t("tickerQuestionsHighlight")}
        className="border-t"
      />

      {/* Финальный призыв — посадочный талон (§4.1, макет landing-v2.html) */}
      <section className="border-t border-border">
        <div className="mx-auto site-wrap px-8 py-16">
          <Reveal>
            <TicketCta
              label={t("ticketLabel")}
              title={t("finalTitle")}
              description={t("finalSubtitle")}
              primary={{ href: ctaHref, text: t("ctaUpload") }}
              secondary={{ href: "/pricing", text: t("allPlans") }}
              fields={[
                { label: t("ticketFirstLabel"), value: t("ticketFirstValue"), accent: true },
                { label: t("ticketCardLabel"), value: t("ticketCardValue") },
              ]}
            />
          </Reveal>
        </div>
      </section>

      <div className="mx-auto site-wrap px-8">
        <BigWordmark />
      </div>
      <SiteFooter />
    </main>
  );
}

// ── Витрина продукта (QA 2026-07-05, п.16): настоящие экраны, а не описания. ───
// Демо-раздача для стола: реальный спот (карманные пятёрки против олл-ина BTN
// на префлопе — короткий стек), обезличенный. Числа сходятся с вердиктом витрины:
// цена колла ~44% (колл 14bb в банк 17.8bb), диапазон пуша 20-25%.
// Рендерится ТЕМ ЖЕ компонентом HandTable, что и в разборе.
const DEMO_BB = 250;
// Метки соперников переведены (t("demoPlayerLabel")) — стол демонстрационный, но
// рендерится тем же HandTable, что и разбор реальных раздач, поэтому русские слова
// внутри английской версии витрины выглядят как несовпадение с текстом рядом
// («это реальные экраны продукта»).
function buildDemoTable(playerWord: string): TableState {
  return {
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
    decisionActor: `${playerWord} 5`,
    playersAfterHero: 0,
    seats: [
      { label: `${playerWord} 1`, position: "EARLY", positionName: "UTG", startingStack: 60 * DEMO_BB, remainingStack: 60 * DEMO_BB, seatNumber: 1, isHero: false, folded: true, isCurrent: false, streetBet: 0, lastAction: { action: "FOLD" } },
      { label: `${playerWord} 2`, position: "EARLY", positionName: "UTG+1", startingStack: 88 * DEMO_BB, remainingStack: 88 * DEMO_BB, seatNumber: 2, isHero: false, folded: true, isCurrent: false, streetBet: 0, lastAction: { action: "FOLD" } },
      { label: `${playerWord} 3`, position: "EARLY", positionName: "LJ", startingStack: 41 * DEMO_BB, remainingStack: 41 * DEMO_BB, seatNumber: 3, isHero: false, folded: true, isCurrent: false, streetBet: 0, lastAction: { action: "FOLD" } },
      { label: `${playerWord} 4`, position: "HJ", positionName: "HJ", startingStack: 25 * DEMO_BB, remainingStack: 25 * DEMO_BB, seatNumber: 4, isHero: false, folded: true, isCurrent: false, streetBet: 0, lastAction: { action: "FOLD" } },
      { label: `${playerWord} 7`, position: "CO", positionName: "CO", startingStack: 52 * DEMO_BB, remainingStack: 52 * DEMO_BB, seatNumber: 5, isHero: false, folded: true, isCurrent: false, streetBet: 0, lastAction: { action: "FOLD" } },
      { label: `${playerWord} 5`, position: "BTN", positionName: "BTN", startingStack: 15 * DEMO_BB, remainingStack: 0, seatNumber: 6, isHero: false, folded: false, isCurrent: true, streetBet: 15 * DEMO_BB, lastAction: { action: "ALL_IN", amount: 15 * DEMO_BB } },
      { label: `${playerWord} 6`, position: "SB", positionName: "SB", startingStack: 33 * DEMO_BB, remainingStack: 33 * DEMO_BB, seatNumber: 7, isHero: false, folded: true, isCurrent: false, streetBet: 0, lastAction: { action: "FOLD" } },
      { label: "Hero", position: "BB", positionName: "BB", startingStack: 34 * DEMO_BB, remainingStack: 33 * DEMO_BB, seatNumber: 8, isHero: true, folded: false, isCurrent: false, streetBet: 1 * DEMO_BB, lastAction: null },
    ],
  };
}

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
      className="grid w-full select-none gap-px"
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
                "grid-cell flex aspect-square items-center justify-center border font-mono leading-none",
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
  const demoTable = buildDemoTable(t("demoPlayerLabel"));

  return (
    <section className="relative border-t border-border">
      <div className="mx-auto site-wrap px-8 py-16 sm:py-24">
        <Reveal>
          <SectionHead
            tag={t("secProductTag")}
            title={t("showcaseTitle")}
            note={t("secProductNote")}
          />
          <p className="-mt-6 mb-8 max-w-2xl text-body text-muted-foreground">
            {t("showcaseSubtitle")}
          </p>
        </Reveal>

        <Reveal delay={60}>
          {/* Стол вставлен без собственной рамки: у окна ровно одна обводка, иначе
              содержимое выглядит стоящим криво (правка Артёма 2026-08-08). */}
          <ProductWindow path={t("windowPath")}>
            <ScaleToFit baseWidth={896}>
              <HandTable state={demoTable} nick={null} fit />
            </ScaleToFit>
          </ProductWindow>
          <FigureCaption>{t("showcaseTableCaption")}</FigureCaption>
        </Reveal>

        <div className="mt-16 grid items-start gap-12 lg:grid-cols-[minmax(280px,30%)_1fr]">
          <Reveal>
            <div>
              <DemoRangeGrid />
              <FigureCaption>{t("showcaseGridCaption")}</FigureCaption>
            </div>
          </Reveal>

          <Reveal delay={60}>
            <div className="relative flex flex-col border border-primary bg-card p-8">
              <CornerMarks />
              <p className="font-mono text-label uppercase tracking-label text-primary">
                {t("showcaseVerdictLabel")}
              </p>
              <p className="mt-4 text-body text-foreground">{t("showcaseVerdictText")}</p>

              {/* Здесь стояли полосы «эквити 54% / цена колла 44%». Убраны 2026-08-09:
                  таких полос в разборе нет, а подпись «настоящий вердикт из разбора»
                  выдавала нарисованную деталь за экран продукта. Витрина показывает
                  только то, что существует. */}

              <p className="mt-auto pt-8 font-mono text-label uppercase tracking-label text-muted-foreground">
                {t("showcaseVerdictNote")}
              </p>
            </div>
          </Reveal>
        </div>

        {/* Демо-стол выше иллюстративный (форма продукта). Тем, кому мало формы и
            нужно доказательство — кнопка на настоящую пройденную раздачу целиком.
            Настоящая кнопка, а не мелкая ссылка (правка Артёма 2026-08-17: искал
            глазами и еле нашёл) — по центру, отдельным акцентом после витрины. */}
        <Reveal delay={120}>
          <div className="mt-12 flex justify-center">
            <Link href="/example" className={cn(buttonVariants({ variant: "outline" }), "gap-2")}>
              {t("showcaseExampleLink")}
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// Иллюстративная карточка разбора для hero. Не настоящие данные пользователя — показывает
// форму продукта: спот → сократовский вопрос → числа парсера. Числа в JetBrains Mono
// (design-system.md §2), ключевые — акцентным лаймом. Некликабельная: без hover-состояния.
async function HandPreview() {
  const t = await getTranslations("Landing");

  return (
    // Главный объект первого экрана — отзывается на курсор наклоном и подсветкой
    <Tilt className="relative border border-border bg-card">
      <CornerMarks />

      <div className="flex items-center justify-between border-b border-border bg-[#151515] px-4 py-3">
        <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {t("previewHandTitle")}
        </p>
        <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {t("previewHandStage")}
        </p>
      </div>

      <div className="p-6 sm:p-8">
        <div className="space-y-2 text-small text-muted-foreground">
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

        {/* Сердце продукта — вопрос предшествует оценке. Здесь его можно потрогать:
            выбираешь ответ, тренер спрашивает дальше (заказ Артёма 2026-08-09). */}
        <HeroDemo
          question={t("previewCoachQuestion")}
          prompt={t("demoPrompt")}
          answers={[t("demoAnswerBluff"), t("demoAnswerValue")]}
          replies={[t("dialogReply"), t("demoReplyValue")]}
          youLabel={t("dialogYou")}
          coachLabel={t("previewCoachLabel")}
          exampleLabel={t("demoExample")}
          afterText={t("demoAfter")}
          retryLabel={t("demoRetry")}
        />

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

        {/* Спарклайн стека (§4.1 п. 9): видно, куда пришёлся провал. Значения
            иллюстративные — в самом разборе линия строится по данным парсера. */}
        <div className="mt-6 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
              {t("stackLabel")}
            </span>
            <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
              {t("stackUnit")}
            </span>
          </div>
          <Sparkline
            className="mt-2"
            values={[22, 26, 32, 29, 40, 36, 48, 44, 52, 46, 18, 16, 12, 10]}
            markAt={10}
          />
          <p className="mt-2 font-mono text-label uppercase tracking-label text-muted-foreground">
            {t("stackNote")}
          </p>
        </div>
      </div>
    </Tilt>
  );
}

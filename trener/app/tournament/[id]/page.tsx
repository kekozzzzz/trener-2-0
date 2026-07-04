import { Suspense } from "react";
import { prisma } from "@/infrastructure/db/client";
import { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { requireSession } from "@/features/auth/session";
import { assessAiAccess } from "@/features/usage/budget";
import { isSubscriptionGateEnabled } from "@/config/plans";
import { bigBlindFromSnapshot } from "@/parser/big-blind";
import { heroDecisionLabel } from "@/parser/hand-summary";
import type { TableSnapshot } from "@/parser/types";
import { HoleCards } from "@/components/poker/hole-cards";
import { unlockTournamentAnalysisAction } from "./actions";
import { personalizeHero } from "@/lib/hero-name";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ParsingWaitClient } from "./parsing-wait-client";
import { AutoUnlockClient } from "./auto-unlock-client";
import { AnalysisProgress } from "./analysis-progress";
import { LeakDynamicsSection } from "./leak-dynamics";
import { StartHereCard, SessionDoneCard, type FocusHand } from "@/components/tournament/focus-slot";
import { MetricsGlossary } from "@/components/metrics/glossary";
import { LoadingDots } from "@/components/ui/loading-dots";

// timeZone UTC — playedAt хранится в UTC из HH-файла, показываем дату ровно как в файле.
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

// Рендер overview обзора: токены {{h:handId|карты}} → кликабельные ссылки на разбор
// раздачи прямо внутри текста; остальной текст персонализируем (Hero → ник игрока).
// handId строго формата UUID — токены ссылок шаг очереди генерирует сам из БД, так
// что произвольный текст модели в ссылку превратиться не может (безопасность).
const HAND_TOKEN = /(\{\{h:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\|[^}]+\}\})/g;
const HAND_TOKEN_ONE = /^\{\{h:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\|([^}]+)\}\}$/;

function renderOverview(overview: string, tournamentId: string, nick: string | null) {
  const parts = overview.split(HAND_TOKEN);
  return parts.map((part, i) => {
    const m = HAND_TOKEN_ONE.exec(part);
    if (!m) return <span key={i}>{personalizeHero(part, nick)}</span>;
    const [, handId, label] = m;
    return (
      <Link
        key={i}
        href={`/tournament/${tournamentId}/hands/${handId}`}
        className="font-medium text-primary underline decoration-primary/40 underline-offset-2 transition-colors hover:decoration-primary"
      >
        {label}
      </Link>
    );
  });
}

function PageHeader() {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
        <Link href="/">
          <Wordmark />
        </Link>
        <AuthNav />
      </div>
    </header>
  );
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-border bg-card p-6">
      <p className="font-mono text-label uppercase tracking-label text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export default async function TournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ duplicate?: string; error?: string }>;
}) {
  const { id } = await params;
  const { duplicate, error } = await searchParams;
  const t = await getTranslations("Tournament");
  // Уровень важности раздачи → подпись. Неизвестный уровень выводим кодом как есть.
  const importanceLabel = (level: string) =>
    level === "CRITICAL"
      ? t("importanceCritical")
      : level === "STRONG"
        ? t("importanceStrong")
        : level === "MEDIUM"
          ? t("importanceMedium")
          : level;
  // Состояние диалога → подпись бейджа. QUESTION_ASKED/ANSWER_RECEIVED — «в работе».
  const dialogueLabel = (state: string) =>
    state === "VERDICT_SHOWN" ? t("dialogueDone") : t("dialogueInProgress");
  const session = await requireSession();
  const tournament = await prisma.tournament.findUnique({ where: { id } });

  if (!tournament || tournament.deletedAt || tournament.playerId !== session.playerId) notFound();

  if (tournament.status === "UPLOADED" || tournament.status === "PARSING") {
    return (
      <main>
        <PageHeader />
        <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
          <div className="max-w-2xl space-y-6">
            <h1 className="text-h1">{t("parsingTitle")}</h1>
            <ParsingWaitClient tournamentId={tournament.id} />
            <Link href="/analyze" className={cn(buttonVariants({ variant: "ghost" }))}>
              {t("uploadMore")}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (tournament.status === "FAILED") {
    return (
      <main>
        <PageHeader />
        <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
          <div className="max-w-2xl space-y-6">
            <h1 className="text-h1">{t("failedTitle")}</h1>
            <div className="border border-destructive p-4">
              <p className="text-small text-destructive">
                {t("failedBody")}
              </p>
            </div>
            <Link href="/analyze" className={cn(buttonVariants())}>
              {t("tryAgain")}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  // Запертый турнир (модель «грузи сколько угодно, разбор — у одного бесплатного»):
  // метрики парсера видны, но платная ИИ-цепочка не запускалась. Показываем метрики и
  // результаты раздач, а вместо разбора — замок с предложением подписки/кнопкой «Разобрать».
  if (!tournament.analysisUnlocked) {
    const vpipLocked = tournament.vpipPercent ? Number(tournament.vpipPercent).toFixed(1) : "—";
    const handsLocked = tournament.handsCount ?? "—";
    const lockedHands = await prisma.hand.findMany({
      where: { tournamentId: id, selectedForCard: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, importanceLevel: true, chipResult: true, tableData: true },
    });
    // Можно ли запустить разбор по клику. Стена выключена → можно всем (ленивый разбор
    // бесплатен). Стена включена → по гейту: первый бесплатный / подписка в пределах лимита.
    const access = isSubscriptionGateEnabled()
      ? await assessAiAccess(prisma, session.playerId, { tournamentId: id })
      : ({ allowed: true } as const);
    const canUnlock = access.allowed;

    return (
      <main>
        <PageHeader />
        <section className="mx-auto max-w-5xl px-8 py-16">
          <h1 className="text-h1">{tournament.name ?? t("resultsTitle")}</h1>
          <p className="mt-2 font-mono text-label uppercase tracking-label text-muted-foreground">
            {dateFormat.format(tournament.playedAt)}
            {tournament.room && ` · ${tournament.room}`}
          </p>

          {error === "LIMIT_REACHED" && (
            <div className="mt-8 border border-destructive p-4">
              <p className="text-small text-destructive">
                {t("errorLimitReached")}
              </p>
            </div>
          )}
          {error === "RATE_LIMITED" && (
            <div className="mt-8 border border-destructive p-4">
              <p className="text-small text-destructive">
                {t("errorRateLimited")}
              </p>
            </div>
          )}

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <StatCard label={t("vpip")}>
              <p className="mt-2 font-mono text-h2 text-foreground">{vpipLocked}%</p>
            </StatCard>
            <StatCard label={t("handsPlayed")}>
              <p className="mt-2 font-mono text-h2 text-foreground">{handsLocked}</p>
            </StatCard>
          </div>

          <div className="mt-16 border border-primary bg-card p-6">
            <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
              {canUnlock ? t("reviewThisTournament") : t("reviewLocked")}
            </p>
            <p className="mt-2 text-body text-foreground">
              {canUnlock ? (error ? t("reviewUnlockedBody") : t("reviewAutoBody")) : t("reviewLockedBody")}
            </p>
            {/* Разбор стартует сам при открытии страницы. Кнопка остаётся только как
                ручной повтор после ошибки (например, часовой лимит): автозапуск после
                редиректа с ?error= зациклил бы запуск-ошибку-запуск. */}
            {canUnlock ? (
              error ? (
                <form action={unlockTournamentAnalysisAction} className="mt-4">
                  <input type="hidden" name="tournamentId" value={tournament.id} />
                  <button type="submit" className={cn(buttonVariants())}>
                    {t("unlockButton")}
                  </button>
                </form>
              ) : (
                <AutoUnlockClient tournamentId={tournament.id} />
              )
            ) : (
              <Link href="/pricing" className={cn(buttonVariants(), "mt-4 inline-flex")}>
                {t("subscribeButton")}
              </Link>
            )}
          </div>

          {lockedHands.length > 0 && (
            <div className="mt-16">
              <h2 className="text-h2">{t("handsTitle")}</h2>
              <p className="mt-2 text-small text-muted-foreground">
                {canUnlock ? t("handsUnlockedNote") : t("handsLockedNote")}
              </p>
              <div className="mt-8 space-y-4">
                {lockedHands.map((hand) => {
                  const sign = hand.chipResult >= 0 ? "+" : "";
                  const bb = bigBlindFromSnapshot(hand.tableData as unknown as TableSnapshot);
                  const bbResult = bb ? hand.chipResult / bb : null;
                  return (
                    <div
                      key={hand.id}
                      className="flex items-center justify-between gap-4 border border-border bg-card p-6"
                    >
                      <Badge variant="outline">
                        {importanceLabel(hand.importanceLevel)}
                      </Badge>
                      <div className="flex flex-col items-end">
                        <span
                          className={cn(
                            "font-mono text-body",
                            hand.chipResult >= 0 ? "text-primary" : "text-foreground"
                          )}
                        >
                          {bbResult !== null ? `${sign}${bbResult.toFixed(1)} BB` : `${sign}${hand.chipResult}`}
                        </span>
                        {bbResult !== null && (
                          <span className="font-mono text-small text-muted-foreground">
                            {sign}
                            {hand.chipResult} {t("chips")}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-16 border-t border-border pt-8 font-mono text-label uppercase tracking-label">
            <Link href="/analyze" className="text-muted-foreground transition-colors hover:text-foreground">
              {t("uploadMore")}
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const vpip = tournament.vpipPercent ? Number(tournament.vpipPercent).toFixed(1) : "—";
  const hands = tournament.handsCount ?? "—";

  const handsForDialogue = await prisma.hand.findMany({
    where: { tournamentId: id, dialogue: { isNot: null } },
    include: { dialogue: { include: { rounds: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Остальные раздачи карточки (STRONG/MEDIUM): без сократовского диалога, но с
  // готовым разбором — их можно открыть и задать прямой вопрос (план 2026-06-17).
  const simpleHands = await prisma.hand.findMany({
    where: {
      tournamentId: id,
      selectedForCard: true,
      dialogue: { is: null },
      analysis: { not: Prisma.DbNull },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, importanceLevel: true, chipResult: true, tableData: true, viewedAt: true },
  });

  // Раздачи карточки, которые ещё разбираются (отобраны, но разбор не готов и диалога нет).
  // Показываем их «в работе» с коротким описанием, пока турнир досчитывается — чтобы было
  // видно, что именно тренер сейчас смотрит. Когда всё готово — список пуст.
  const pendingHands = await prisma.hand.findMany({
    where: {
      tournamentId: id,
      selectedForCard: true,
      dialogue: { is: null },
      analysis: { equals: Prisma.DbNull },
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, tableData: true },
  });

  // Обзор турнира (GENERATE_TOURNAMENT_SUMMARY) — может быть ещё не готов (null).
  // overview содержит инлайн-токены ссылок {{h:handId|карты}} (см. renderOverview).
  const summary = tournament.summary as { overview?: string } | null;

  // Верхний слот (план 2026-07-03-верхний-слот-турнира). Финиш сессии — все
  // сократовские диалоги дошли до вердикта; хвост карточки (сильные/средние) финишу
  // не мешает. Пока финиша нет — «начни отсюда»: самая дорогая непройденная раздача
  // (наибольшая потеря; без потерь — наибольший размах). Кандидаты только с готовым
  // контентом: раздачи «в работе» (pendingHands) сюда не попадают.
  const dialoguesDone = handsForDialogue.filter((h) => h.dialogue!.state === "VERDICT_SHOWN").length;
  const sessionDone = handsForDialogue.length > 0 && dialoguesDone === handsForDialogue.length;
  const unfinished: FocusHand[] = [
    ...handsForDialogue.filter((h) => h.dialogue!.state !== "VERDICT_SHOWN"),
    ...simpleHands.filter((h) => h.viewedAt === null),
  ];
  const worstLoss = [...unfinished].sort((a, b) => a.chipResult - b.chipResult)[0];
  const startHere =
    worstLoss && worstLoss.chipResult < 0
      ? worstLoss
      : ([...unfinished].sort((a, b) => Math.abs(b.chipResult) - Math.abs(a.chipResult))[0] ?? null);

  // Ник игрока для показа вместо «Hero» (только отображение; в LLM не идёт).
  const me = await prisma.player.findUnique({
    where: { id: session.playerId },
    select: { nickname: true },
  });
  const nick = me?.nickname ?? null;

  // Турнир ещё досчитывается, пока не готова общая картина (она собирается последней,
  // из уже разобранных раздач). Пока идёт — держим живое обновление и плейсхолдеры,
  // чтобы раздачи и картина всплывали сами, без ручного обновления страницы.
  const processing = tournament.status !== "CARD_READY" || !summary?.overview;

  return (
    <main>
      <PageHeader />
      <section className="mx-auto max-w-5xl px-8 py-16">

        {duplicate && (
          <div className="mb-8 border border-border bg-card p-4">
            <p className="text-small text-muted-foreground">
              {t("duplicateNote")}
            </p>
          </div>
        )}

        <h1 className="text-h1">{tournament.name ?? t("resultsTitle")}</h1>
        <p className="mt-2 font-mono text-label uppercase tracking-label text-muted-foreground">
          {dateFormat.format(tournament.playedAt)}
          {tournament.room && ` · ${tournament.room}`}
        </p>

        {/* Пока турнир досчитывается — баннер с честными этапами. Он же опрашивает статус и
            подгоняет страницу, чтобы разборы раздач всплывали в списках ниже по очереди. */}
        {processing && (
          <div className="mt-12 border border-border bg-card p-6">
            <AnalysisProgress tournamentId={id} />
          </div>
        )}

        {/* Верхний слот: финиш сессии или точка входа «начни отсюда». */}
        {sessionDone ? (
          <SessionDoneCard count={handsForDialogue.length} />
        ) : (
          startHere && <StartHereCard tournamentId={id} hand={startHere} />
        )}

        {/* Общая картина — наверху. Готова → показываем; ещё собирается → плейсхолдер. */}
        <div className="mt-16">
          <h2 className="text-h2">{t("overviewTitle")}</h2>
          {summary?.overview ? (
            <p className="mt-4 max-w-3xl text-body text-foreground">
              {renderOverview(summary.overview, id, nick)}
            </p>
          ) : (
            <p className="mt-4 flex items-center gap-2 text-body text-muted-foreground">
              {t("overviewLoading")}
              <LoadingDots />
            </p>
          )}
        </div>

        <div className="mt-16 flex items-center justify-between gap-4">
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            {t("metrics")}
          </p>
          <MetricsGlossary />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <StatCard label={t("vpip")}>
            <p className="mt-2 font-mono text-h2 text-foreground">{vpip}%</p>
          </StatCard>
          <StatCard label={t("handsPlayed")}>
            <p className="mt-2 font-mono text-h2 text-foreground">{hands}</p>
          </StatCard>
        </div>

        {/* Динамика ликов — стримится отдельно (Suspense), чтобы скан раздач окна не
            задерживал показ карточки. Цель сессии на странице турнира не показываем
            (мешала разбору — решение Артёма 2026-07-03), она живёт на «Моих турнирах». */}
        <Suspense fallback={null}>
          <LeakDynamicsSection playerId={session.playerId} tournamentId={id} />
        </Suspense>

        {handsForDialogue.length > 0 && (
          <div className="mt-16">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="text-h2">{t("criticalHandsTitle")}</h2>
              <span
                className={cn(
                  "font-mono text-label uppercase tracking-label",
                  sessionDone ? "text-primary" : "text-muted-foreground"
                )}
              >
                {t("dialogueProgress", { done: dialoguesDone, total: handsForDialogue.length })}
              </span>
            </div>
            <p className="mt-2 text-small text-muted-foreground">
              {t("criticalHandsNote")}
            </p>
            <div className="mt-8 space-y-4">
              {handsForDialogue.map((hand, index) => {
                const dialogue = hand.dialogue!;
                const snap = hand.tableData as unknown as TableSnapshot;
                const label = heroDecisionLabel(snap);
                // Разбор завершён (вердикт показан) → лаймовая обводка, как у просмотренных.
                const done = dialogue.state === "VERDICT_SHOWN";
                return (
                  <Link
                    key={hand.id}
                    href={`/tournament/${id}/hands/${hand.id}`}
                    className={cn(
                      "group flex items-center justify-between gap-4 border bg-card p-6 transition-colors duration-150 ease-out hover:border-primary",
                      done ? "border-primary" : "border-border"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <HoleCards cards={snap.heroCards ?? []} />
                      <div className="flex min-w-0 flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
                            {t("handLabel", { index: index + 1 })}
                          </span>
                          <Badge variant={dialogue.state === "VERDICT_SHOWN" ? "done" : "outline"}>
                            {dialogueLabel(dialogue.state)}
                          </Badge>
                        </div>
                        {label && <span className="text-small text-muted-foreground">{label}</span>}
                      </div>
                    </div>
                    <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-colors duration-150 ease-out group-hover:text-primary" />
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Хвост карточки — дополнительный материал, свёрнут по умолчанию: финиш сессии
            наступает по критическим, а сюда игрок заходит, когда хочет копнуть глубже. */}
        {simpleHands.length > 0 && (
          <details className="group mt-16">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 border border-border bg-card p-6 transition-colors duration-150 ease-out hover:border-primary [&::-webkit-details-marker]:hidden">
              <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
                {t("strongMediumTitle", { count: simpleHands.length })}
              </span>
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-open:rotate-180" />
            </summary>
            <p className="mt-4 text-small text-muted-foreground">
              {t("strongMediumNote")}
            </p>
            <div className="mt-8 space-y-4">
              {simpleHands.map((hand) => {
                const sign = hand.chipResult >= 0 ? "+" : "";
                const snap = hand.tableData as unknown as TableSnapshot;
                const label = heroDecisionLabel(snap);
                const bb = bigBlindFromSnapshot(snap);
                const bbResult = bb ? hand.chipResult / bb : null;
                // Просмотрена → лаймовая обводка + бейдж «Просмотрено» (быстро видно, что уже разобрал).
                const viewed = hand.viewedAt !== null;
                return (
                  <Link
                    key={hand.id}
                    href={`/tournament/${id}/hands/${hand.id}`}
                    className={cn(
                      "group flex items-center justify-between gap-4 border bg-card p-6 transition-colors duration-150 ease-out hover:border-primary",
                      viewed ? "border-primary" : "border-border"
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <Badge variant="outline" className="shrink-0">
                        {importanceLabel(hand.importanceLevel)}
                      </Badge>
                      {viewed && (
                        <Badge variant="done" className="shrink-0">
                          {t("viewed")}
                        </Badge>
                      )}
                      <HoleCards cards={snap.heroCards ?? []} />
                      {label && (
                        <span className="truncate text-small text-muted-foreground">{label}</span>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-4">
                      <div className="flex flex-col items-end">
                        <span
                          className={cn(
                            "font-mono text-body",
                            hand.chipResult >= 0 ? "text-primary" : "text-foreground"
                          )}
                        >
                          {bbResult !== null ? `${sign}${bbResult.toFixed(1)} BB` : `${sign}${hand.chipResult}`}
                        </span>
                        {bbResult !== null && (
                          <span className="font-mono text-small text-muted-foreground">
                            {sign}
                            {hand.chipResult} {t("chips")}
                          </span>
                        )}
                      </div>
                      <ArrowRight className="size-4 text-muted-foreground transition-colors duration-150 ease-out group-hover:text-primary" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </details>
        )}

        {processing && pendingHands.length > 0 && (
          <div className="mt-16">
            <h2 className="text-h2">{t("reviewingNowTitle")}</h2>
            <p className="mt-2 text-small text-muted-foreground">
              {t("reviewingNowNote")}
            </p>
            <div className="mt-8 space-y-4">
              {pendingHands.map((hand) => {
                const snap = hand.tableData as unknown as TableSnapshot;
                const label = heroDecisionLabel(snap);
                return (
                  <div
                    key={hand.id}
                    className="flex items-center justify-between gap-4 border border-border bg-card p-6 opacity-70"
                  >
                    <div className="flex min-w-0 items-center gap-4">
                      <HoleCards cards={snap.heroCards ?? []} />
                      {label && (
                        <span className="truncate text-small text-muted-foreground">{label}</span>
                      )}
                    </div>
                    <span className="flex shrink-0 items-center gap-2 font-mono text-label uppercase tracking-label text-muted-foreground">
                      {t("reviewing")}
                      <LoadingDots />
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-16 border-t border-border pt-8 font-mono text-label uppercase tracking-label">
          <Link href="/analyze" className="text-muted-foreground transition-colors hover:text-foreground">
            {t("uploadMore")}
          </Link>
        </div>
      </section>
    </main>
  );
}

import { prisma } from "@/infrastructure/db/client";
import { Prisma } from "@prisma/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDialogueRoundsPerHand } from "@/config/dialogue";
import { requireSession } from "@/features/auth/session";
import { personalizeHero } from "@/lib/hero-name";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ParsingWaitClient } from "./parsing-wait-client";
import { MetricsGlossary } from "@/components/metrics/glossary";

const DIALOGUE_STATE_LABEL: Record<string, string> = {
  QUESTION_ASKED: "вопрос задан",
  ANSWER_RECEIVED: "обрабатываем",
  VERDICT_SHOWN: "вердикт готов",
};

const IMPORTANCE_LABEL: Record<string, string> = {
  STRONG: "Сильная",
  MEDIUM: "Средняя",
};

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
  searchParams: Promise<{ duplicate?: string }>;
}) {
  const { id } = await params;
  const { duplicate } = await searchParams;
  const session = await requireSession();
  const tournament = await prisma.tournament.findUnique({ where: { id } });

  if (!tournament || tournament.deletedAt || tournament.playerId !== session.playerId) notFound();

  if (tournament.status === "UPLOADED" || tournament.status === "PARSING") {
    return (
      <main>
        <PageHeader />
        <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
          <div className="max-w-2xl space-y-6">
            <h1 className="text-h1">Разбираем файл</h1>
            <ParsingWaitClient tournamentId={tournament.id} />
            <Link href="/analyze" className={cn(buttonVariants({ variant: "ghost" }))}>
              ← Загрузить ещё
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
            <h1 className="text-h1">Ошибка разбора</h1>
            <div className="border border-destructive p-4">
              <p className="text-small text-destructive">
                Файл не удалось разобрать. Убедись, что это MTT-турнир GGPoker.
              </p>
            </div>
            <Link href="/analyze" className={cn(buttonVariants())}>
              ← Попробовать снова
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
    select: { id: true, importanceLevel: true, chipResult: true },
  });

  const totalRounds = getDialogueRoundsPerHand();

  // Обзор турнира (GENERATE_TOURNAMENT_SUMMARY) — может быть ещё не готов (null).
  // overview содержит инлайн-токены ссылок {{h:handId|карты}} (см. renderOverview).
  const summary = tournament.summary as { overview?: string } | null;

  // Ник игрока для показа вместо «Hero» (только отображение; в LLM не идёт).
  const me = await prisma.player.findUnique({
    where: { id: session.playerId },
    select: { nickname: true },
  });
  const nick = me?.nickname ?? null;

  return (
    <main>
      <PageHeader />
      <section className="mx-auto max-w-5xl px-8 py-16">
        {duplicate && (
          <div className="mb-8 border border-border bg-card p-4">
            <p className="text-small text-muted-foreground">
              Этот турнир уже был загружен — вот его разбор. Повторно он не добавляется.
            </p>
          </div>
        )}

        <h1 className="text-h1">{tournament.name ?? "Результаты турнира"}</h1>
        <p className="mt-2 font-mono text-label uppercase tracking-label text-muted-foreground">
          {dateFormat.format(tournament.playedAt)}
          {tournament.room && ` · ${tournament.room}`}
        </p>

        <div className="mt-8 flex items-center justify-between gap-4">
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Метрики
          </p>
          <MetricsGlossary />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <StatCard label="VPIP">
            <p className="mt-2 font-mono text-h2 text-foreground">{vpip}%</p>
          </StatCard>
          <StatCard label="Рук сыграно">
            <p className="mt-2 font-mono text-h2 text-foreground">{hands}</p>
          </StatCard>
        </div>

        {summary?.overview && (
          <div className="mt-16">
            <h2 className="text-h2">Общая картина</h2>
            <p className="mt-4 max-w-3xl text-body text-foreground">
              {renderOverview(summary.overview, id, nick)}
            </p>
          </div>
        )}

        {handsForDialogue.length > 0 && (
          <div className="mt-16">
            <h2 className="text-h2">Раздачи для разбора</h2>
            <div className="mt-8 space-y-4">
              {handsForDialogue.map((hand, index) => {
                const dialogue = hand.dialogue!;
                const progress = dialogue.rounds.length;
                return (
                  <Link
                    key={hand.id}
                    href={`/tournament/${id}/hands/${hand.id}`}
                    className="group flex items-center justify-between gap-4 border border-border bg-card p-6 transition-colors duration-150 ease-out hover:border-primary"
                  >
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
                        Раздача {index + 1}
                      </span>
                      <Badge variant={dialogue.state === "QUESTION_ASKED" ? "default" : "outline"}>
                        {DIALOGUE_STATE_LABEL[dialogue.state] ?? dialogue.state}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-mono text-small text-muted-foreground">
                        раунд {progress}/{totalRounds}
                      </span>
                      <ArrowRight className="size-4 text-muted-foreground transition-colors duration-150 ease-out group-hover:text-primary" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {simpleHands.length > 0 && (
          <div className="mt-16">
            <h2 className="text-h2">Остальные раздачи</h2>
            <p className="mt-2 text-small text-muted-foreground">
              Загляни в любую и спроси, если по ней есть вопрос.
            </p>
            <div className="mt-8 space-y-4">
              {simpleHands.map((hand) => {
                const sign = hand.chipResult >= 0 ? "+" : "";
                return (
                  <Link
                    key={hand.id}
                    href={`/tournament/${id}/hands/${hand.id}`}
                    className="group flex items-center justify-between gap-4 border border-border bg-card p-6 transition-colors duration-150 ease-out hover:border-primary"
                  >
                    <Badge variant="outline">
                      {IMPORTANCE_LABEL[hand.importanceLevel] ?? hand.importanceLevel}
                    </Badge>
                    <div className="flex items-center gap-4">
                      <span
                        className={cn(
                          "font-mono text-body",
                          hand.chipResult >= 0 ? "text-primary" : "text-foreground"
                        )}
                      >
                        {sign}
                        {hand.chipResult}
                      </span>
                      <ArrowRight className="size-4 text-muted-foreground transition-colors duration-150 ease-out group-hover:text-primary" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-16 border-t border-border pt-8 font-mono text-label uppercase tracking-label">
          <Link href="/analyze" className="text-muted-foreground transition-colors hover:text-foreground">
            ← Загрузить ещё
          </Link>
        </div>
      </section>
    </main>
  );
}

import { prisma } from "@/infrastructure/db/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getDialogueRoundsPerHand } from "@/config/dialogue";
import { requireSession } from "@/features/auth/session";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ParsingWaitClient } from "./parsing-wait-client";

const DIALOGUE_STATE_LABEL: Record<string, string> = {
  QUESTION_ASKED: "вопрос задан",
  ANSWER_RECEIVED: "обрабатываем",
  VERDICT_SHOWN: "вердикт готов",
};

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
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
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
            <Link href="/" className={cn(buttonVariants({ variant: "ghost" }))}>
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
            <Link href="/" className={cn(buttonVariants())}>
              ← Попробовать снова
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const vpip = tournament.vpipPercent ? Number(tournament.vpipPercent).toFixed(1) : "—";
  const hands = tournament.handsCount ?? "—";
  const result = tournament.resultBuyins ? Number(tournament.resultBuyins).toFixed(2) : "—";
  const resultSign = tournament.resultBuyins && Number(tournament.resultBuyins) >= 0 ? "+" : "";

  const handsForDialogue = await prisma.hand.findMany({
    where: { tournamentId: id, dialogue: { isNot: null } },
    include: { dialogue: { include: { rounds: true } } },
    orderBy: { createdAt: "asc" },
  });

  const totalRounds = getDialogueRoundsPerHand();

  return (
    <main>
      <PageHeader />
      <section className="mx-auto max-w-5xl px-8 py-16">
        <h1 className="text-h1">Результаты турнира</h1>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <StatCard label="VPIP">
            <p className="mt-2 font-mono text-h2 text-foreground">{vpip}%</p>
          </StatCard>
          <StatCard label="Рук сыграно">
            <p className="mt-2 font-mono text-h2 text-foreground">{hands}</p>
          </StatCard>
          <StatCard label="Итог">
            <p className="mt-2 font-mono text-h1 text-primary">
              {resultSign}
              {result}
            </p>
            <p className="mt-1 font-mono text-label uppercase tracking-label text-muted-foreground">
              бай-ина
            </p>
          </StatCard>
        </div>

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

        <div className="mt-16 border-t border-border pt-8 font-mono text-label uppercase tracking-label">
          <Link href="/" className="text-muted-foreground transition-colors hover:text-foreground">
            ← Загрузить ещё
          </Link>
        </div>
      </section>
    </main>
  );
}

import { prisma } from "@/infrastructure/db/client";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getDialogue } from "@/features/dialogue/queries";
import { requireSession } from "@/features/auth/session";
import { AuthNav } from "@/components/auth-nav";
import { AnswerForm } from "./answer-form";
import { WaitClient } from "./wait-client";
import { cn } from "@/lib/utils";

export default async function HandDialoguePage({
  params,
}: {
  params: Promise<{ id: string; handId: string }>;
}) {
  const { id, handId } = await params;
  const session = await requireSession();

  const hand = await prisma.hand.findUnique({
    where: { id: handId },
    include: { tournament: true },
  });

  if (
    !hand ||
    hand.tournamentId !== id ||
    hand.tournament.playerId !== session.playerId ||
    hand.tournament.deletedAt
  ) {
    notFound();
  }

  const dialogue = await getDialogue(handId);
  if (!dialogue) notFound();

  const openRound = dialogue.state === "QUESTION_ASKED" ? dialogue.rounds[dialogue.rounds.length - 1] : null;
  const historyRounds = openRound ? dialogue.rounds.slice(0, -1) : dialogue.rounds;
  const chipResult = dialogue.hand.chipResult;
  const chipSign = chipResult >= 0 ? "+" : "";

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

      <section className="mx-auto max-w-5xl px-8 py-16">
        <h1 className="text-h1">Разбор раздачи</h1>

        <div className="mt-8 border border-border bg-card p-6">
          {dialogue.hand.played && <p className="text-body text-muted-foreground">{dialogue.hand.played}</p>}
          <p
            className={cn(
              "mt-4 font-mono text-display",
              chipResult >= 0 ? "text-primary" : "text-foreground"
            )}
          >
            {chipSign}
            {chipResult}
          </p>
          <p className="mt-1 font-mono text-label uppercase tracking-label text-muted-foreground">фишек</p>
        </div>

        {historyRounds.length > 0 && (
          <div className="mt-16 space-y-8">
            <h2 className="text-h2">История</h2>
            {historyRounds.map((round) => (
              <div key={round.roundNumber} className="space-y-2">
                <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
                  Вопрос {round.roundNumber}
                </p>
                <p className="text-body text-foreground">{round.question}</p>
                <div className="border border-border bg-card p-4">
                  <p className="text-body text-muted-foreground">{round.answer}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-16">
          {dialogue.state === "QUESTION_ASKED" && openRound && (
            <div className="space-y-2">
              <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
                Вопрос {openRound.roundNumber}
              </p>
              <p className="text-h3 text-foreground">{openRound.question}</p>
              <AnswerForm tournamentId={id} handId={handId} />
            </div>
          )}

          {dialogue.state === "ANSWER_RECEIVED" && <WaitClient handId={handId} />}

          {dialogue.state === "VERDICT_SHOWN" && (
            <div className="space-y-4">
              <h2 className="text-h2">Вердикт</h2>
              <div className="border border-primary bg-card p-6">
                <p className="text-body text-foreground">{dialogue.verdict}</p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-16 border-t border-border pt-8 font-mono text-label uppercase tracking-label">
          <Link href={`/tournament/${id}`} className="text-muted-foreground transition-colors hover:text-foreground">
            ← К турниру
          </Link>
        </div>
      </section>
    </main>
  );
}

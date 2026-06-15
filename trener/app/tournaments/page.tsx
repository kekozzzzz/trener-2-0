import Link from "next/link";
import { requireSession } from "@/features/auth/session";
import { listMyTournaments } from "@/features/tournaments/queries";
import { PageHeader } from "@/components/page-header";
import { TournamentRow } from "@/components/tournaments/tournament-row";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function TournamentsPage() {
  const { playerId } = await requireSession();
  const tournaments = await listMyTournaments(playerId);

  return (
    <main>
      <PageHeader />
      <section className="mx-auto max-w-5xl px-8 py-16">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-h1">Мои турниры</h1>
          <Link href="/" className={cn(buttonVariants())}>
            Загрузить турнир
          </Link>
        </div>

        {tournaments.length === 0 ? (
          <div className="mt-8 border border-border bg-card p-8">
            <p className="text-body text-muted-foreground">
              Здесь появятся загруженные турниры. Пока ни одного — загрузи первый.
            </p>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {tournaments.map((tournament) => (
              <TournamentRow key={tournament.id} tournament={tournament} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

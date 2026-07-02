import { noindex } from "@/lib/seo";
export const metadata = noindex;
import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/features/auth/session";
import { listMyTournaments } from "@/features/tournaments/queries";
import { getPlayerCharacteristic } from "@/features/profile/queries";
import { CHARACTERISTIC_RELIABLE_FROM } from "@/config/profile";
import { PageHeader } from "@/components/page-header";
import { TournamentRow } from "@/components/tournaments/tournament-row";
import { PlayerCharts } from "@/components/profile/player-charts";
import { ProfileLeakTrend } from "./leak-trend";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Сводка после пакетной загрузки (числа из query, кладёт обработчик /analyze).
function UploadSummary({ uploaded, dup, failed, capped, t }: {
  uploaded: number; dup: number; failed: number; capped: number | null;
  t: Awaited<ReturnType<typeof getTranslations<"Tournaments">>>;
}) {
  const parts = [t("summaryUploaded", { count: uploaded })];
  if (dup > 0) parts.push(t("summaryDup", { count: dup }));
  if (failed > 0) parts.push(t("summaryFailed", { count: failed }));
  return (
    <div className="mt-8 border border-primary bg-card p-4">
      <p className="text-small text-foreground">{parts.join(" · ")}.</p>
      {capped != null && (
        <p className="mt-1 text-small text-muted-foreground">
          {t("summaryCapped", { count: capped })}
        </p>
      )}
    </div>
  );
}

function toInt(value: string | undefined): number {
  const n = value ? parseInt(value, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export default async function TournamentsPage({
  searchParams,
}: {
  searchParams: Promise<{ uploaded?: string; dup?: string; failed?: string; capped?: string }>;
}) {
  const t = await getTranslations("Tournaments");
  const { playerId } = await requireSession();
  const tournaments = await listMyTournaments(playerId);
  const characteristic = await getPlayerCharacteristic(playerId);
  const sp = await searchParams;
  const uploaded = toInt(sp.uploaded);
  const dup = toInt(sp.dup);
  const failed = toInt(sp.failed);
  const capped = sp.capped ? toInt(sp.capped) : null;
  const showSummary = uploaded > 0 || dup > 0 || failed > 0;

  return (
    <main>
      <PageHeader />
      <section className="mx-auto max-w-5xl px-8 py-16">
        {/* Профиль игры — наверху (сводная характеристика по всей дистанции), ниже турниры. */}
        {characteristic && (
          <div className="mb-16 border-b border-border pb-16">
            <h1 className="text-h1">{t("profileTitle")}</h1>
            <p className="mt-4 max-w-3xl whitespace-pre-line text-body text-foreground">
              {characteristic.characteristic}
            </p>
            <p className="mt-3 text-small text-muted-foreground">
              {characteristic.tournamentsCounted >= CHARACTERISTIC_RELIABLE_FROM
                ? t("profileReliable", { count: characteristic.tournamentsCounted })
                : t("profilePreliminary", {
                    count: characteristic.tournamentsCounted,
                    threshold: CHARACTERISTIC_RELIABLE_FROM,
                  })}
            </p>
            <PlayerCharts />
            {/* «Куда ты движешься»: тренд ликов по игровым дням — стримится отдельно
                (Suspense), скан окна не задерживает список турниров. */}
            <Suspense fallback={null}>
              <ProfileLeakTrend playerId={playerId} />
            </Suspense>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4">
          {characteristic ? (
            <h2 className="text-h2">{t("myTournaments")}</h2>
          ) : (
            <h1 className="text-h1">{t("myTournaments")}</h1>
          )}
          <Link href="/analyze" className={cn(buttonVariants())}>
            {t("uploadTournament")}
          </Link>
        </div>

        {showSummary && (
          <UploadSummary uploaded={uploaded} dup={dup} failed={failed} capped={capped} t={t} />
        )}

        {tournaments.length === 0 ? (
          <div className="mt-8 border border-border bg-card p-8">
            <p className="text-body text-muted-foreground">
              {t("emptyList")}
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

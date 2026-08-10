import { noindex } from "@/lib/seo";
import { getLocale } from "next-intl/server";

// Заголовок вкладки — иначе все страницы назывались как лендинг (QA 2026-07-05, п.10).
export async function generateMetadata() {
  const locale = await getLocale();
  return { ...noindex, title: locale === "en" ? "My tournaments" : "Мои турниры" };
}
import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/features/auth/session";
import { listMyTournamentsPage } from "@/features/tournaments/queries";
import { getPlayerCharacteristic } from "@/features/profile/queries";
import { CHARACTERISTIC_RELIABLE_FROM } from "@/config/profile";
import { cookies } from "next/headers";
import {
  normalizePerPage,
  TOURNAMENTS_PER_PAGE_DEFAULT,
  TOURNAMENTS_PER_PAGE_OPTIONS,
  TOURNAMENTS_PER_PAGE_COOKIE,
} from "@/config/tournaments";
import { PageHeader } from "@/components/page-header";
import { TournamentRow } from "@/components/tournaments/tournament-row";
import { TournamentsPagination } from "@/components/tournaments/pagination";
import { TournamentsAutoRefresh } from "@/components/tournaments/auto-refresh";
import { PlayerCharts } from "@/components/profile/player-charts";
import { ProfileLeakTrend } from "./leak-trend";
import { SessionGoalSection } from "./session-goal";
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
  searchParams: Promise<{
    uploaded?: string;
    dup?: string;
    failed?: string;
    capped?: string;
    page?: string;
    per?: string;
  }>;
}) {
  const t = await getTranslations("Tournaments");
  const { playerId } = await requireSession();
  const sp = await searchParams;
  // Из адреса приходит что угодно (руками правят, ссылки живут дольше данных):
  // мусор превращаем в дефолт, а не в ошибку. Страницу за пределами диапазона
  // прижимает к последней сам listMyTournamentsPage.
  // Размер страницы помним в cookie (адрес его терял). Явный ?per в адресе (шаринг ссылки) имеет
  // приоритет, иначе берём запомненный выбор, иначе дефолт.
  const perCookie = toInt((await cookies()).get(TOURNAMENTS_PER_PAGE_COOKIE)?.value);
  const perPage = normalizePerPage(toInt(sp.per) || perCookie || TOURNAMENTS_PER_PAGE_DEFAULT);
  const { items: tournaments, total, page, totalPages } = await listMyTournamentsPage(playerId, {
    page: toInt(sp.page) || 1,
    perPage,
  });
  const characteristic = await getPlayerCharacteristic(playerId);
  const uploaded = toInt(sp.uploaded);
  const dup = toInt(sp.dup);
  const failed = toInt(sp.failed);
  const capped = sp.capped ? toInt(sp.capped) : null;
  const showSummary = uploaded > 0 || dup > 0 || failed > 0;
  const showPagination = total > TOURNAMENTS_PER_PAGE_OPTIONS[0];
  // Есть незавершённый парсинг — держим список живым (сам обновляется до «готов»).
  const hasProcessing = tournaments.some(
    (tr) => tr.status === "UPLOADED" || tr.status === "PARSING",
  );

  return (
    <main>
      <PageHeader />
      <section className="mx-auto site-wrap px-8 py-16">
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
            {/* Цель на сессию и динамика ошибок СПРЯТАНЫ 2026-07-04 (решение Артёма:
                «спрячь пока, потом вернём») — код цел, вернуть = раскомментировать.
            <Suspense fallback={null}>
              <SessionGoalSection playerId={playerId} />
            </Suspense>
            <Suspense fallback={null}>
              <ProfileLeakTrend playerId={playerId} />
            </Suspense>
            */}
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

        <TournamentsAutoRefresh active={hasProcessing} />

        {tournaments.length === 0 ? (
          <div className="mt-8 border border-border bg-card p-8">
            <p className="text-body text-muted-foreground">
              {t("emptyList")}
            </p>
          </div>
        ) : (
          <>
            <div className="mt-8 space-y-4">
              {tournaments.map((tournament) => (
                <TournamentRow key={tournament.id} tournament={tournament} />
              ))}
            </div>
            {/* Пока турниров меньше самого мелкого шага — листать и выбирать нечего,
                строка была бы шумом. */}
            {showPagination && (
              <TournamentsPagination
                page={page}
                perPage={perPage}
                total={total}
                totalPages={totalPages}
              />
            )}
          </>
        )}
      </section>
    </main>
  );
}

import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getTournamentSessionGoal } from "@/features/profile/queries";
import type { LeakKind } from "@/features/profile/leak-trend";
import { cn } from "@/lib/utils";

// Ссылки на эталонные чарты — та же карта, что в блоке на «Моих турнирах».
const CHART_HREF: Partial<Record<LeakKind, string>> = {
  OPEN_WIDE: "/charts#open",
  OPEN_SHOVE_WIDE: "/charts#push",
  BB_3BET_WIDE: "/charts#bb",
  VS_OPEN_3BET_WIDE: "/charts#vsopen",
  ISO_WIDE: "/charts#iso",
};

// Блок «Цель этой сессии» на странице турнира (план 2026-07-03, Фаза 2): цель,
// действовавшая для игрового дня этого турнира, и итог по дню — «выполнено ✓» лаймом
// или «нарушено N раз». У турниров одного вечера блок одинаковый (день целиком).
// Всё детерминированно (Правило 1); серверный компонент под Suspense; цели не было —
// блока нет. Если день ещё играется, счётчик честно показывает «пока».
export async function TournamentSessionGoal({
  playerId,
  tournamentId,
}: {
  playerId: string;
  tournamentId: string;
}) {
  const view = await getTournamentSessionGoal(playerId, tournamentId);
  if (!view) return null;

  const t = await getTranslations("SessionGoal");
  const { goal, result } = view;

  return (
    <div className={cn("mt-16 border bg-card p-6", result.done ? "border-primary" : "border-border")}>
      <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
        {t("titleThis")}
      </p>
      <p className="mt-2 text-h3 text-foreground">{t(`goal_${goal}`)}</p>
      {CHART_HREF[goal] && (
        <p className="mt-2 text-small text-muted-foreground">
          <Link href={CHART_HREF[goal]} className="text-foreground underline">
            {t(`chartLink_${goal}`)}
          </Link>
        </p>
      )}
      <p
        className={cn(
          "mt-4 font-mono text-label uppercase tracking-label",
          result.done ? "text-primary" : "text-muted-foreground",
        )}
      >
        {result.done ? t("thisDone") : t("thisFailed", { count: result.violations })}
      </p>
    </div>
  );
}

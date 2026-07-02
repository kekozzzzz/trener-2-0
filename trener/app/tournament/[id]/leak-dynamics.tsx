import { getTranslations } from "next-intl/server";
import { getTournamentLeakDynamics } from "@/features/profile/queries";
import { LeakTrendRows } from "@/components/profile/leak-trend-rows";

// Блок «Динамика» на странице турнира (лик-трекер, plans/2026-07-02-лик-трекер.md):
// системные ошибки по окну прошлых ИГРОВЫХ ДНЕЙ против дня этого турнира — «в прошлые
// дни лимпил 4 · 2 · 3, в этот день ни разу». У турниров одного вечера блок одинаковый —
// день целиком (решение Артёма 2026-07-02). Всё считает парсер по чартам (Правило 1).
// Серверный компонент под Suspense: скан окна не тормозит саму страницу. Нечего
// показать (первые дни игрока / системных ликов нет) — блока просто нет.
export async function LeakDynamicsSection({
  playerId,
  tournamentId,
}: {
  playerId: string;
  tournamentId: string;
}) {
  const view = await getTournamentLeakDynamics(playerId, tournamentId);
  if (!view || view.trends.length === 0) return null;

  const t = await getTranslations("LeakDynamics");

  return (
    <div className="mt-16">
      <h2 className="text-h2">{t("title")}</h2>
      <p className="mt-2 max-w-2xl text-small text-muted-foreground">
        {t("intro", { count: view.priorCount })}
      </p>
      <div className="mt-8">
        <LeakTrendRows trends={view.trends} />
      </div>
    </div>
  );
}

import { getTranslations } from "next-intl/server";
import { getProfileLeakTrend } from "@/features/profile/queries";
import { LeakTrendRows } from "@/components/profile/leak-trend-rows";

// Сколько ликов максимум показать в профиле — сводка, не простыня (самые системные
// сверху, сортировку даёт leakDynamics). Не бизнес-порог, а защита страницы.
const PROFILE_MAX_TRENDS = 3;

// Тренд ликов на «Моих турнирах», под характеристикой игрока: характеристика отвечает
// «какой ты игрок», этот блок — «куда ты движешься» (последний игровой день на фоне
// прошлых). Лик-трекер, plans/2026-07-02-лик-трекер.md; всё детерминированно (Правило 1).
// Серверный компонент под Suspense; нечего показать — блока нет.
export async function ProfileLeakTrend({ playerId }: { playerId: string }) {
  const view = await getProfileLeakTrend(playerId);
  if (!view || view.trends.length === 0) return null;

  const t = await getTranslations("LeakDynamics");

  return (
    <div className="mt-12">
      <h3 className="text-h3">{t("profileHeading")}</h3>
      <p className="mt-2 max-w-2xl text-small text-muted-foreground">
        {t("profileIntro", { count: view.priorCount })}
      </p>
      <div className="mt-6">
        <LeakTrendRows trends={view.trends.slice(0, PROFILE_MAX_TRENDS)} />
      </div>
    </div>
  );
}

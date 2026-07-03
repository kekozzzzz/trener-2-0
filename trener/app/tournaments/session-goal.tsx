import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSessionGoalView } from "@/features/profile/queries";
import type { LeakKind } from "@/features/profile/leak-trend";
import { cn } from "@/lib/utils";

// Задания, у которых есть эталон на странице «Чарты» — ссылка «посмотреть норму»
// ведёт к якорю своего спота. Остальные виды получат ссылки по мере зашивки чартов.
const CHART_HREF: Partial<Record<LeakKind, string>> = {
  OPEN_WIDE: "/charts#open",
  OPEN_SHOVE_WIDE: "/charts#push",
};

// Блок «Задание на сессию» на «Моих турнирах» (план 2026-07-03, форма и формулировки
// приняты Артёмом): одна цель из главного системного лика + итог прошлой сессии.
// Лаймовая рамка — прошлое задание выполнено (момент «я расту»). Для лика открытий
// ссылка на эталонный чарт /charts («не открывайся широко» честно только с нормой
// перед глазами). Всё детерминированно (Правило 1), серверный компонент под Suspense;
// нет системных ликов — блока нет.
export async function SessionGoalSection({ playerId }: { playerId: string }) {
  const view = await getSessionGoalView(playerId);
  if (!view) return null;

  const t = await getTranslations("SessionGoal");
  const { goal, goalStats, last } = view;
  const done = last?.done === true;

  return (
    <div className={cn("mt-12 border bg-card p-6", done ? "border-primary" : "border-border")}>
      <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
        {t("title")}
      </p>
      <p className="mt-2 text-h3 text-foreground">{t(`goal_${goal}`)}</p>
      <p className="mt-2 text-small text-muted-foreground">
        {t("context", { days: goalStats.days, window: goalStats.window, count: goalStats.total })}
        {CHART_HREF[goal] && (
          <>
            {" "}
            <Link href={CHART_HREF[goal]} className="text-foreground underline">
              {t(`chartLink_${goal}`)}
            </Link>
          </>
        )}
      </p>
      {last && (
        <p
          className={cn(
            "mt-4 font-mono text-label uppercase tracking-label",
            done ? "text-primary" : "text-muted-foreground",
          )}
        >
          {done
            ? t("lastDone")
            : last.kind === goal
              ? t("lastFailedStays", { count: last.violations })
              : t("lastFailed", { count: last.violations })}
        </p>
      )}
    </div>
  );
}

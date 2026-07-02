import { getTranslations } from "next-intl/server";
import type { LeakDynamics } from "@/features/profile/leak-trend";
import { cn } from "@/lib/utils";

// Строки динамики ликов — общая вёрстка для страницы турнира и «Моих турниров».
// По каждому активному лику — человеческая фраза вместо голой цепочки счётчиков
// (правка Артёма 2026-07-02: «числа ни о чём не говорят»): «в 4 из 5 прошлых игровых
// дней - всего 11 раз», справа текущий день; «в этот день ни разу» — лаймом (прогресс,
// ради которого блок и есть). Серверный компонент, числа посчитаны парсером (Правило 1).
export async function LeakTrendRows({ trends }: { trends: LeakDynamics[] }) {
  const t = await getTranslations("LeakDynamics");

  return (
    <div className="space-y-4">
      {trends.map((trend) => {
        const daysWithLeak = trend.window.filter((n) => n > 0).length;
        return (
        <div
          key={trend.kind}
          className={cn(
            "flex flex-wrap items-center justify-between gap-4 border bg-card p-6",
            trend.improved ? "border-primary" : "border-border",
          )}
        >
          <div className="flex min-w-0 flex-col gap-2">
            <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
              {t(`kind_${trend.kind}`)}
            </span>
            <span className="text-small text-muted-foreground">
              {t("priorSummary", {
                days: daysWithLeak,
                total: trend.window.length,
                count: trend.priorTotal,
              })}
            </span>
          </div>
          <span
            className={cn(
              "shrink-0 font-mono text-body",
              trend.improved ? "text-primary" : "text-foreground",
            )}
          >
            {trend.improved ? t("cleanNow") : t("currentTimes", { count: trend.current })}
          </span>
        </div>
        );
      })}
    </div>
  );
}

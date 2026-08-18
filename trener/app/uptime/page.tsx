import { getLocale, getTranslations } from "next-intl/server";
import { noindex } from "@/lib/seo";
import { getAppBaseUrl } from "@/config/app";
import { PageHeader } from "@/components/page-header";
import { SiteFooter } from "@/components/site-footer";
import { PageIntro, BigWordmark } from "@/components/site/detail";
import type { HealthResult } from "@/infrastructure/health/run-health-check";

export const dynamic = "force-dynamic";

// Заголовок вкладки — та же схема, что у /support (утилитарная noindex-страница,
// без отдельного намespace в Meta).
export async function generateMetadata() {
  const locale = await getLocale();
  return { ...noindex, title: locale === "en" ? "Service status" : "Статус сервиса" };
}

// Публичное зеркало /api/health — тот же эндпоинт, что дёргает внешний UptimeRobot
// (project_health_monitoring), просто с человеческими подписями вместо db/worker.
// Собственный fetch, а не прямой вызов runHealthCheck: не дублируем сборку зависимостей
// и кэш, которые уже живут в app/api/health/route.ts.
async function fetchHealth(): Promise<HealthResult | null> {
  try {
    const res = await fetch(`${getAppBaseUrl()}/api/health`, { cache: "no-store" });
    return (await res.json()) as HealthResult;
  } catch {
    return null;
  }
}

export default async function UptimePage() {
  const t = await getTranslations("Uptime");
  const locale = await getLocale();
  const health = await fetchHealth();
  const ok = health?.status === "ok";

  // Только db+worker — ровно те две проверки, которые в run-health-check.ts реально
  // роняют статус (telegram/claude там справочные, наружу их не выносим).
  const items = [
    { label: t("siteLabel"), ok: health?.checks.db === "ok" },
    { label: t("queueLabel"), ok: health?.checks.worker === "ok" },
  ];

  return (
    <main>
      <PageHeader />

      <section className="mx-auto site-wrap px-8 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl">
          <PageIntro tag={t("sectionTag")} title={t("title")} subtitle={t("subtitle")} />

          <div className="mt-12 border border-border bg-card p-8">
            <div className="flex items-center gap-3">
              {/* Точка акцентом = «работает» (тот же приём, что в StatusBar). Для
                  проблемы — приглушённый серый, не красный: design-system.md §1
                  резервирует #FF5C5C только под ошибку валидации формы. */}
              <i
                aria-hidden
                className={`block size-2.5 ${ok ? "bg-primary" : "bg-muted-foreground"}`}
              />
              <p className="font-mono text-[1.25rem] uppercase tracking-label">
                {health === null ? t("unknown") : ok ? t("allOk") : t("problem")}
              </p>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between border-t border-border pt-4"
                >
                  <span className="text-body text-muted-foreground">{item.label}</span>
                  <span
                    className={`font-mono text-label uppercase tracking-label ${
                      item.ok ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {item.ok ? t("statusOk") : t("statusDown")}
                  </span>
                </div>
              ))}
            </div>

            {health && (
              <p className="mt-8 font-mono text-[0.6875rem] text-muted-foreground">
                {t("lastCheck", { time: new Date(health.ts).toLocaleString(locale) })}
              </p>
            )}
          </div>
        </div>

        <BigWordmark />
      </section>

      <SiteFooter hideWordmark />
    </main>
  );
}

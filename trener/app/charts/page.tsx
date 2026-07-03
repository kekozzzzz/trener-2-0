import { noindex } from "@/lib/seo";
export const metadata = noindex;
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/features/auth/session";
import { PageHeader } from "@/components/page-header";
import { ReferenceChartsPanel } from "@/components/charts/reference-charts-panel";
import { PushChartPanel } from "@/components/charts/push-chart-panel";

// Страница «Чарты» — эталонные диапазоны (норма), в отличие от «Твоих чартов»
// (зеркала игрока). Нужна заданиям на сессию: «не открывайся шире нормы» честно
// только когда норму можно посмотреть (план 2026-07-03-задание-на-сессию.md,
// Фаза 1.5). Учебный материал ВНЕ игры (не realtime-подсказки — GG-безопасно).
// Доступ: залогиненным, без пейволла (приманка ценности, решение на показе формы).
// v1 — открытия первым (RFI); дальше по конвейеру: пуш-фолд, защита BB, vs-опен,
// изоляция (данные собраны, см. memory/план).
export default async function ChartsPage() {
  await requireSession();
  const t = await getTranslations("ReferenceCharts");

  return (
    <main>
      <PageHeader />
      <section className="mx-auto max-w-5xl px-8 py-16">
        <h1 className="text-h1">{t("title")}</h1>
        <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("intro")}</p>

        <div className="mt-12" id="open">
          <h2 className="text-h2">{t("openTitle")}</h2>
          <p className="mt-2 max-w-2xl text-small text-muted-foreground">{t("openIntro")}</p>
          <div className="mt-6">
            <ReferenceChartsPanel />
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-16" id="push">
          <h2 className="text-h2">{t("pushTitle")}</h2>
          <p className="mt-2 max-w-2xl text-small text-muted-foreground">{t("pushIntro")}</p>
          <div className="mt-6">
            <PushChartPanel />
          </div>
        </div>
      </section>
    </main>
  );
}

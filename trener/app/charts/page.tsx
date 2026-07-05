import { noindex } from "@/lib/seo";
import { getLocale } from "next-intl/server";

// Заголовок вкладки — иначе все страницы назывались как лендинг (QA 2026-07-05, п.10).
export async function generateMetadata() {
  const locale = await getLocale();
  return { ...noindex, title: locale === "en" ? "Charts" : "Чарты" };
}
import { getTranslations } from "next-intl/server";
import { requireSession } from "@/features/auth/session";
import { PageHeader } from "@/components/page-header";
import { ReferenceChartsPanel } from "@/components/charts/reference-charts-panel";
import { PushChartPanel } from "@/components/charts/push-chart-panel";
import { BBDefensePanel } from "@/components/charts/bb-defense-panel";
import { VsOpenPanel } from "@/components/charts/vs-open-panel";
import { IsoPanel } from "@/components/charts/iso-panel";
import {
  RestealPanel,
  CallVsPushPanel,
  CallVsRestealPanel,
  BvbPanel,
  FourBetPanel,
  SqueezePanel,
} from "@/components/charts/extra-panels";

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

        <div className="mt-16 border-t border-border pt-16" id="bb">
          <h2 className="text-h2">{t("bbTitle")}</h2>
          <p className="mt-2 max-w-2xl text-small text-muted-foreground">{t("bbIntro")}</p>
          <div className="mt-6">
            <BBDefensePanel />
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-16" id="vsopen">
          <h2 className="text-h2">{t("vsOpenTitle")}</h2>
          <p className="mt-2 max-w-2xl text-small text-muted-foreground">{t("vsOpenIntro")}</p>
          <div className="mt-6">
            <VsOpenPanel />
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-16" id="iso">
          <h2 className="text-h2">{t("isoTitle")}</h2>
          <p className="mt-2 max-w-2xl text-small text-muted-foreground">{t("isoIntro")}</p>
          <div className="mt-6">
            <IsoPanel />
          </div>
        </div>

        {/* Доборные эталоны (QA 2026-07-05, пункт 7): всё, чем судит тренер, — видно игроку. */}
        <div className="mt-16 border-t border-border pt-16" id="bvb">
          <h2 className="text-h2">{t("bvbTitle")}</h2>
          <p className="mt-2 max-w-2xl text-small text-muted-foreground">{t("bvbIntro")}</p>
          <div className="mt-6">
            <BvbPanel />
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-16" id="resteal">
          <h2 className="text-h2">{t("restealTitle")}</h2>
          <p className="mt-2 max-w-2xl text-small text-muted-foreground">{t("restealIntro")}</p>
          <div className="mt-6">
            <RestealPanel />
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-16" id="callvspush">
          <h2 className="text-h2">{t("cvpTitle")}</h2>
          <p className="mt-2 max-w-2xl text-small text-muted-foreground">{t("cvpIntro")}</p>
          <div className="mt-6">
            <CallVsPushPanel />
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-16" id="callvsresteal">
          <h2 className="text-h2">{t("cvrTitle")}</h2>
          <p className="mt-2 max-w-2xl text-small text-muted-foreground">{t("cvrIntro")}</p>
          <div className="mt-6">
            <CallVsRestealPanel />
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-16" id="fourbet">
          <h2 className="text-h2">{t("fourbetTitle")}</h2>
          <p className="mt-2 max-w-2xl text-small text-muted-foreground">{t("fourbetIntro")}</p>
          <div className="mt-6">
            <FourBetPanel />
          </div>
        </div>

        <div className="mt-16 border-t border-border pt-16" id="squeeze">
          <h2 className="text-h2">{t("squeezeTitle")}</h2>
          <p className="mt-2 max-w-2xl text-small text-muted-foreground">{t("squeezeIntro")}</p>
          <div className="mt-6">
            <SqueezePanel />
          </div>
        </div>
      </section>
    </main>
  );
}

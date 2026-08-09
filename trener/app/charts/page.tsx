import { indexablePage } from "@/lib/seo";
import { getLocale } from "next-intl/server";

// Страница публичная и открыта поиску (решение Артёма 2026-07-06): чарты гуглятся
// бесплатно где угодно — мы ничего не теряем, а получаем поисковый трафик по запросам
// вида «пуш фолд чарт» и дверь в продукт («загрузи руки — сравним с этой же нормой»).
export async function generateMetadata() {
  const locale = await getLocale();
  return {
    ...indexablePage("/charts"),
    title: locale === "en" ? "MTT Preflop Charts" : "Префлоп-чарты для MTT",
    description:
      locale === "en"
        ? "Reference preflop charts for MTT poker: opening ranges, push-fold, BB defense, 3-bet vs open, resteal, call vs push. Free, no signup required."
        : "Эталонные префлоп-чарты для покерных турниров: открытия по позициям, пуш-фолд, защита BB, 3-бет против опена, рестил, коллы против пуша. Бесплатно, без регистрации.",
  };
}
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getSession } from "@/features/auth/session";
import { PageHeader } from "@/components/page-header";
import { PageIntro, BigWordmark } from "@/components/site/detail";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ReferenceChartsPanel } from "@/components/charts/reference-charts-panel";
import { PushChartPanel } from "@/components/charts/push-chart-panel";
import { BBDefensePanel } from "@/components/charts/bb-defense-panel";
import { VsOpenPanel } from "@/components/charts/vs-open-panel";
import { IsoPanel } from "@/components/charts/iso-panel";
import { SbLimpPanel } from "@/components/charts/sb-limp-panel";
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
// Доступ: ПУБЛИЧНЫЙ, без логина (решение Артёма 2026-07-06 — бесплатный магнит:
// чарты у всех бесплатные, наша ценность не в них, а в сравнении с ТВОЕЙ игрой).
export default async function ChartsPage() {
  const session = await getSession();
  const t = await getTranslations("ReferenceCharts");

  return (
    <main>
      <PageHeader />
      <section className="mx-auto max-w-5xl px-8 py-16">
        <PageIntro
          tag={t("sectionTag")}
          title={t("title")}
          subtitle={t("intro")}
          className="max-w-2xl"
        />

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

        {/* Лимп с малого блайнда (заказ Артёма 19-20.07): у чарта один спот, переключателя нет. */}
        <div className="mt-16 border-t border-border pt-16" id="sblimp">
          <h2 className="text-h2">{t("sbLimpTitle")}</h2>
          <p className="mt-2 max-w-2xl text-small text-muted-foreground">{t("sbLimpIntro")}</p>
          <div className="mt-6">
            <SbLimpPanel />
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

        {/* Дверь в продукт: норма выше — а дальше сравнение с СОБСТВЕННОЙ игрой.
            Загрузка и «Твои чарты» бесплатны (считает парсер, без ИИ) — зазыв честный. */}
        <div className="mt-16 border-t border-border pt-16">
          <h2 className="text-h2">{t("ctaTitle")}</h2>
          <p className="mt-4 max-w-2xl text-body text-muted-foreground">{t("ctaText")}</p>
          <Link
            href={session ? "/tournaments" : "/enter"}
            className={cn(buttonVariants({ size: "lg" }), "mt-8")}
          >
            {t("ctaButton")}
          </Link>
        </div>

        {/* Подвальный вордмарк — общий приём публичных страниц (§4.1 п. 11) */}
        <BigWordmark />
      </section>
    </main>
  );
}

import { CircleHelp, ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

// Раскрывающаяся инструкция «как выгрузить руки из GGPoker» под формой загрузки.
// Нативный <details> — без клиентского JS, доступно с клавиатуры, вписано в
// брутализм дизайн-системы (без скруглений, акцент-лайм, иконки вместо эмодзи).
//
// Шаги выгрузки HH из GGPoker/PokerCraft — по реальному флоу клиента (скриншоты
// Артёма). Скриншоты подставляются в поле image каждого шага (файлы в /public/help);
// awaitShot — показывать пустой слот под ещё не присланный скриншот. Тексты шагов —
// в словаре UploadGuideOld; здесь только стабильные id и путь к скриншоту.

type GuideStep = { id: string; image?: string; awaitShot?: boolean };

const STEPS: GuideStep[] = [
  { id: "pokercraft", image: "/help/01-pokercraft.png" },
  { id: "tournament", image: "/help/02-tournament.png" },
  { id: "period", image: "/help/03-period.png" },
  { id: "checkbox", image: "/help/04-checkbox.png" },
  { id: "download", image: "/help/05-download.png" },
  { id: "upload" },
];

export async function UploadGuide() {
  const t = await getTranslations("UploadGuideOld");

  return (
    <details className="group border border-border bg-card text-left">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 font-mono text-label uppercase tracking-label text-muted-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <CircleHelp className="h-4 w-4" aria-hidden />
          {t("toggle")}
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
      </summary>

      <ol className="space-y-8 border-t border-border px-6 py-8">
        {STEPS.map((step, i) => {
          const title = t(`steps.${step.id}.title`);
          return (
            <li key={step.id} className="flex gap-4">
              <span className="shrink-0 font-mono text-h3 leading-none text-primary">{i + 1}</span>
              <div className="min-w-0 flex-1 space-y-3">
                <div className="space-y-1">
                  <h3 className="text-body font-medium text-foreground">{title}</h3>
                  <p className="text-small text-muted-foreground">{t(`steps.${step.id}.body`)}</p>
                </div>
                {step.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={step.image} alt={title} className="w-full border border-border" />
                ) : step.awaitShot ? (
                  <div className="flex min-h-44 w-full items-center justify-center border border-border bg-background">
                    <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
                      {t("screenshotPlaceholder")}
                    </span>
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </details>
  );
}

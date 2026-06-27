import { CircleHelp, ChevronRight } from "lucide-react";

// Раскрывающаяся инструкция «как выгрузить руки из GGPoker» под формой загрузки.
// Нативный <details> — без клиентского JS, доступно с клавиатуры, вписано в
// брутализм дизайн-системы (без скруглений, акцент-лайм, иконки вместо эмодзи).
//
// Шаги выгрузки HH из GGPoker/PokerCraft — по реальному флоу клиента (скриншоты
// Артёма). Скриншоты подставляются в поле image каждого шага (файлы в /public/help);
// awaitShot — показывать пустой слот под ещё не присланный скриншот.

type GuideStep = { title: string; body: string; image?: string; awaitShot?: boolean };

const STEPS: GuideStep[] = [
  {
    title: "Открой PokerCraft",
    body: "В клиенте сверху нажми иконку истории — откроется панель событий. Внизу неё нажми «PokerCraft…».",
    image: "/help/01-pokercraft.png",
  },
  {
    title: "Слева выбери «Турнир»",
    body: "В окне PokerCraft в меню слева открой раздел «Турнир» — это список сыгранных турниров.",
    image: "/help/02-tournament.png",
  },
  {
    title: "Выбери период и нажми «ПОКАЗАТЬ»",
    body: "Вверху в фильтре «Дата» поставь нужный период (например «Последние 7 дней») и нажми красную кнопку «ПОКАЗАТЬ».",
    image: "/help/03-period.png",
  },
  {
    title: "Отметь галочкой нужный турнир",
    body: "Слева от каждого турнира есть квадратик. Поставь галочку у того, который хочешь разобрать (или вверху у заголовка — выбрать сразу все).",
    image: "/help/04-checkbox.png",
  },
  {
    title: "Скачай руки красной кнопкой",
    body: "Нажми КРАСНУЮ кнопку «Установка — истории игр». Зелёная «Итоги игры» рядом — это итоги, а не руки, она не подойдёт.",
    image: "/help/05-download.png",
  },
  {
    title: "Загрузи файл сюда",
    body: "Скачанный файл с руками выбери в поле выше и нажми «Разобрать».",
  },
];

export function UploadGuide() {
  return (
    <details className="group border border-border bg-card text-left">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 font-mono text-label uppercase tracking-label text-muted-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <CircleHelp className="h-4 w-4" aria-hidden />
          Как выгрузить руки из GGPoker
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 transition-transform group-open:rotate-90" aria-hidden />
      </summary>

      <ol className="space-y-8 border-t border-border px-6 py-8">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-4">
            <span className="shrink-0 font-mono text-h3 leading-none text-primary">{i + 1}</span>
            <div className="min-w-0 flex-1 space-y-3">
              <div className="space-y-1">
                <h3 className="text-body font-medium text-foreground">{step.title}</h3>
                <p className="text-small text-muted-foreground">{step.body}</p>
              </div>
              {step.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={step.image} alt={step.title} className="w-full border border-border" />
              ) : step.awaitShot ? (
                <div className="flex min-h-44 w-full items-center justify-center border border-border bg-background">
                  <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
                    скриншот
                  </span>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}

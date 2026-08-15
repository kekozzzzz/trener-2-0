import { CircleHelp, ChevronRight, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SUPPORTED_ROOMS, type SupportedRoom } from "@/config/rooms";

// Подсказка «Как выгрузить руки» — вложенные раскрывашки на нативном <details>
// (без клиентского JS, доступно с клавиатуры, в стиле дизайн-системы). Верхний
// тумблер раскрывает список румов; клик по руму раскрывает его шаги. Пока ничего
// не нажато — инструкций не видно.
//
// Названия румов — по узнаваемому клиенту/скину, а не по сети: iPoker → Red Star
// Poker, Chico → BetOnline (игрок знает свой скин, а не имя сети). Сеть — в подписи.
//
// Тексты (шаги, подписи сети, примечания, пути к папкам, расширения) живут в
// словаре UploadGuide — здесь только стабильные id и имена румов. hasTag/hasNote/
// hasPaths говорят, показывать ли соответствующий блок для рума.

// Список румов переехал в config/rooms.ts: он же кормит ленту на главной, чтобы
// витрина и гайд не разошлись. PokerPlanets и Chico пока без скриншотов — клиенты
// закрытые, публичных скринов нет, шаги текстом.
const HAND_HISTORY_ROOMS = SUPPORTED_ROOMS;

// Скриншоты к шагам: номер шага (с нуля) → файл в /public/help.
// Обработаны: ники и чужие пометки убраны, наши метки — лаймовые.
// Экспортирован: та же карта кормит HowTo-разметку (components/structured-data.tsx)
// на страницах /how-to-export/[room] — один источник, скрины не разъедутся с шагами.
export const STEP_SHOTS: Record<string, Record<number, string>> = {
  ggpoker: {
    2: "/help/01-pokercraft.png",
    3: "/help/02-tournament.png",
    4: "/help/03-period.png",
    5: "/help/04-checkbox.png",
    6: "/help/05-download.png",
  },
  pokerstars: { 3: "/help/pokerstars/settings.png" },
  winamax: {
    1: "/help/winamax/menu.png",
    2: "/help/winamax/options.png",
    3: "/help/winamax/tracker.png",
  },
  "888poker": { 2: "/help/888poker/settings.png" },
  acr: { 1: "/help/acr/lobby.png", 2: "/help/acr/settings.png" },
  ipoker: { 1: "/help/ipoker/settings.png" },
  // chico: публичные скрины слишком мыльные — добавим свой, когда снимем из клиента
  // pokerplanets: публичных скринов клиента нет (рум закрытый) — добавим, когда снимем сами
};

// Тело инструкции по руму — шаги, скриншоты, путь к папке, расширение, примечание.
// Без обёртки <details>: переиспользуется и внутри раскрывашки (RoomDetails, ниже),
// и открытым текстом на отдельной странице /how-to-export/[room] (SEO — там нужен
// видимый, а не спрятанный за кликом контент под конкретный запрос вида «как
// выгрузить историю раздач <рум>»).
export async function RoomSteps({ room }: { room: SupportedRoom }) {
  const t = await getTranslations("UploadGuide");
  const steps = t.raw(`steps.${room.id}`) as string[];
  const paths = room.hasPaths ? (t.raw(`paths.${room.id}`) as string[]) : null;

  return (
    <div className="px-6 pb-8 pt-6">
      <ol className="space-y-4">
        {steps.map((step, i) => {
          const shot = STEP_SHOTS[room.id]?.[i];
          return (
            <li key={i} className="flex items-start gap-4">
              <span className="flex size-6 shrink-0 items-center justify-center bg-primary font-mono text-label font-medium text-background">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-3">
                <span className="text-body">{step}</span>
                {shot && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shot}
                    alt={step}
                    loading="lazy"
                    decoding="async"
                    className="w-full border border-border"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {paths && (
        <div className="mt-6 flex items-start gap-2">
          <ArrowRight className="mt-1 size-4 shrink-0 text-primary" aria-hidden />
          <div className="space-y-1">
            <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
              {t("folderLabel")}
            </p>
            {paths.map((p, i) => (
              <p key={i} className="break-all font-mono text-small text-foreground">
                {p}
              </p>
            ))}
          </div>
        </div>
      )}

      <p className="mt-6 font-mono text-label uppercase tracking-label text-muted-foreground">
        {t("uploadLabelPrefix")} <span className="text-primary">{t(`ext.${room.id}`)}</span>
      </p>

      {room.hasNote && (
        <p className="mt-4 border-l border-primary pl-4 text-small text-muted-foreground">
          {t(`notes.${room.id}`)}
        </p>
      )}
    </div>
  );
}

// Одна раскрывашка рума: клик по названию раскрывает шаги (пока не нажали — скрыто).
async function RoomDetails({ room }: { room: SupportedRoom }) {
  const t = await getTranslations("UploadGuide");

  return (
    <details className="group/room border-t border-border first:border-t-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-body font-medium text-foreground">{room.name}</span>
          {room.hasTag && (
            <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
              {t(`networkLabels.${room.id}`)}
            </span>
          )}
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/room:rotate-90"
          aria-hidden
        />
      </summary>

      <RoomSteps room={room} />
    </details>
  );
}

// withToggle=true (по умолчанию, для инлайна на загрузке): верхний тумблер «Как
// выгрузить руки» скрывает весь список. withToggle=false (для отдельной страницы,
// где заголовок уже есть): сразу показываем список румов-раскрывашек.
export async function HandHistoryGuide({ withToggle = true }: { withToggle?: boolean }) {
  const t = await getTranslations("UploadGuide");

  const rooms = (
    <div>
      {HAND_HISTORY_ROOMS.map((room) => (
        <RoomDetails key={room.id} room={room} />
      ))}
    </div>
  );

  if (!withToggle) {
    return <div className="border border-border bg-card text-left">{rooms}</div>;
  }

  return (
    <details className="group/top border border-border bg-card text-left">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-4 font-mono text-label uppercase tracking-label text-muted-foreground transition-colors hover:text-primary [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <CircleHelp className="size-4" aria-hidden />
          {t("toggle")}
        </span>
        <ChevronRight
          className="size-4 shrink-0 transition-transform group-open/top:rotate-90"
          aria-hidden
        />
      </summary>
      <div className="border-t border-border">{rooms}</div>
    </details>
  );
}

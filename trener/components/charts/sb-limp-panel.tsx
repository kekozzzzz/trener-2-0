import { useTranslations } from "next-intl";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import { sbLimpCellState } from "@/config/poker/sb-limp-chart";
import { cn } from "@/lib/utils";
import { LegendSwatch } from "@/components/charts/legend";

const SIZE = GRID_RANKS.length; // 13

// Эталонный чарт ЛИМПА С МАЛОГО БЛАЙНДА (страница /charts, заказ Артёма 19-20.07).
// Переключателя позиций тут нет: спот один — фолд до нас на SB. Слои: лайм — открываем РЕЙЗОМ
// (лимп тут не наш выбор); яркий серый — лимпим и КОЛЛИРУЕМ рейз большого блайнда; приглушённый —
// лимпим, но на рейз сбрасываем. Фолда до флопа в чарте нет вовсе: с малого блайнда входим любой
// рукой. Из тех же множеств, что грейдер тренера (sbLimpCellState) — разойтись не могут.
export function SbLimpPanel() {
  const t = useTranslations("ReferenceCharts");

  return (
    <>
      <div
        className="mt-2 grid w-full max-w-[420px] select-none gap-px"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: SIZE }).map((_, row) =>
          Array.from({ length: SIZE }).map((__, col) => {
            const code = cellCode(row, col);
            const state = sbLimpCellState(code);
            return (
              <div
                key={code}
                title={`${code}: ${t(`sbLimpCell_${state}`)}`}
                className={cn(
                  "flex aspect-square items-center justify-center border font-mono leading-none",
                  state === "RAISE_FIRST" && "border-primary bg-primary text-primary-foreground",
                  state === "LIMP_CALL" && "border-border bg-card text-foreground",
                  state === "LIMP_FOLD" && "border-border bg-card text-muted-foreground/30",
                  state === "FOLD" && "border-border bg-card text-muted-foreground/30"
                )}
              >
                <span className="text-[0.5rem] sm:text-[0.65rem]">{code}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-6 flex flex-col gap-2 text-small text-muted-foreground">
        <span className="flex items-center gap-2">
          <LegendSwatch className="border-primary bg-primary text-primary-foreground" />
          {t("sbLimpLegendRaise")}
        </span>
        <span className="flex items-center gap-2">
          <LegendSwatch className="border-border bg-card text-foreground" />
          {t("sbLimpLegendCall")}
        </span>
        <span className="flex items-center gap-2">
          <LegendSwatch className="border-border bg-card text-muted-foreground/30" />
          {t("sbLimpLegendFold")}
        </span>
      </div>

      <p className="mt-6 max-w-2xl text-small text-muted-foreground">{t("sbLimpDisclaimer")}</p>
    </>
  );
}

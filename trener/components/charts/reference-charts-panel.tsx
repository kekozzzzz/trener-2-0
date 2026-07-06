"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import { rfiCellState, type OpenPosition } from "@/config/poker/rfi-chart";
import { cn } from "@/lib/utils";
import { LegendSwatch } from "@/components/charts/legend";

const SIZE = GRID_RANKS.length; // 13

const POSITIONS: OpenPosition[] = ["UTG", "MP", "HJ", "CO", "BTN", "SB"];

// Эталонный чарт открытий (страница «Чарты», план 2026-07-03-задание-на-сессию.md,
// Фаза 1.5). Показывает НОРМУ слоями — решение Артёма 2026-07-03 (вариант 1):
//   сплошной лайм — «открывай всегда» (ядро);
//   лайм-контур   — «иногда, по ситуации» (весовые руки ~50%);
//   серый         — граница допуска: не ошибка, но и не рекомендация;
//   приглушённый  — не открывается.
// Раскраска считается из ТОГО ЖЕ конфига, которым судит детектор (rfiCellState) —
// страница и тренер не могут разойтись. Данные статичны — компонент без загрузки.
export function ReferenceChartsPanel() {
  const t = useTranslations("ReferenceCharts");
  const [pos, setPos] = useState<OpenPosition>("UTG");

  return (
    <>
      {/* Переключатель позиций — как в «Твоих чартах», чтобы глаз не переучивался */}
      <div className="flex flex-wrap gap-2">
        {POSITIONS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPos(p)}
            aria-pressed={pos === p}
            className={cn(
              "border px-3 py-2 font-mono text-label uppercase tracking-label transition-colors duration-150 ease-out",
              pos === p
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:border-primary"
            )}
          >
            {p}
          </button>
        ))}
      </div>

      {pos === "SB" && (
        <p className="mt-3 max-w-2xl text-small text-muted-foreground">{t("sbNote")}</p>
      )}

      <div
        className="mt-6 grid w-full max-w-[420px] select-none gap-px"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: SIZE }).map((_, row) =>
          Array.from({ length: SIZE }).map((__, col) => {
            const code = cellCode(row, col);
            const state = rfiCellState(pos, code);
            return (
              <div
                key={code}
                title={`${code}: ${t(`cell_${state}`)}`}
                className={cn(
                  "flex aspect-square items-center justify-center border font-mono leading-none",
                  state === "ALWAYS" && "border-primary bg-primary text-primary-foreground",
                  state === "SOMETIMES" && "border-primary bg-card text-primary",
                  state === "BORDER" && "border-border bg-card text-foreground",
                  state === "OUT" && "border-border bg-card text-muted-foreground/30"
                )}
              >
                <span className="text-[0.5rem] sm:text-[0.65rem]">{code}</span>
              </div>
            );
          })
        )}
      </div>

      {/* Легенда слоёв */}
      <div className="mt-6 flex flex-col gap-2 text-small text-muted-foreground">
        <span className="flex items-center gap-2">
          <LegendSwatch className="border-primary bg-primary text-primary-foreground" />
          {t("legendAlways")}
        </span>
        <span className="flex items-center gap-2">
          <LegendSwatch className="border-primary bg-card text-primary" />
          {t("legendSometimes")}
        </span>
        <span className="flex items-center gap-2">
          <LegendSwatch className="border-border bg-card text-foreground" />
          {t("legendBorder")}
        </span>
        <span className="flex items-center gap-2">
          <LegendSwatch className="border-border bg-card text-muted-foreground/30" />
          {t("legendOut")}
        </span>
      </div>

      {/* Честная подпись: что это за диапазоны и почему они мягче солверных.
          Текст на редактуре у Артёма (показ страницы 2026-07-03). */}
      <p className="mt-6 max-w-2xl text-small text-muted-foreground">{t("disclaimer")}</p>
      <p className="mt-2 max-w-2xl text-small text-muted-foreground">{t("depthNote")}</p>
    </>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import {
  pushCellState,
  type PushPosition,
  type StackBand,
} from "@/config/poker/push-fold-chart";
import { cn } from "@/lib/utils";
import { LegendSwatch } from "@/components/charts/legend";

const SIZE = GRID_RANKS.length; // 13

// Подписи позиций для игрока: MP2 из чарта показываем как MP; HJ играет по CO
// (оговорка в тексте под сеткой).
const POSITIONS: { key: PushPosition; label: string }[] = [
  { key: "UTG", label: "UTG" },
  { key: "MP2", label: "MP" },
  { key: "CO", label: "CO" },
  { key: "BTN", label: "BTN" },
  { key: "SB", label: "SB" },
];

const BANDS: StackBand[] = ["SHORT", "MID"];

// Эталонный чарт пуш-фолда (страница /charts, план 2026-07-03, Фаза 1.5):
// опен-шов первым в банк на коротком стеке, позиция × стек-бэнд. Слои: лайм — пуш,
// серый — граница допуска, приглушённый — фолд. Раскраска из того же конфига, что
// у детектора (pushCellState) — страница и тренер не могут разойтись.
export function PushChartPanel() {
  const t = useTranslations("ReferenceCharts");
  const [band, setBand] = useState<StackBand>("SHORT");
  const [pos, setPos] = useState<PushPosition>("UTG");

  return (
    <>
      {/* Переключатель стек-бэнда */}
      <div className="flex flex-wrap gap-2">
        {BANDS.map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBand(b)}
            aria-pressed={band === b}
            className={cn(
              "border px-3 py-2 font-mono text-label uppercase tracking-label transition-colors duration-150 ease-out",
              band === b
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:border-primary"
            )}
          >
            {t(`band_${b}`)}
          </button>
        ))}
      </div>

      {/* Переключатель позиций */}
      <div className="mt-3 flex flex-wrap gap-2">
        {POSITIONS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPos(p.key)}
            aria-pressed={pos === p.key}
            className={cn(
              "border px-3 py-2 font-mono text-label uppercase tracking-label transition-colors duration-150 ease-out",
              pos === p.key
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:border-primary"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div
        className="mt-6 grid w-full max-w-[420px] select-none gap-px"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: SIZE }).map((_, row) =>
          Array.from({ length: SIZE }).map((__, col) => {
            const code = cellCode(row, col);
            const state = pushCellState(band, pos, code);
            return (
              <div
                key={code}
                title={`${code}: ${t(`pushCell_${state}`)}`}
                className={cn(
                  "flex aspect-square items-center justify-center border font-mono leading-none",
                  state === "ALWAYS" && "border-primary bg-primary text-primary-foreground",
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

      {/* Легенда */}
      <div className="mt-6 flex flex-col gap-2 text-small text-muted-foreground">
        <span className="flex items-center gap-2">
          <LegendSwatch className="border-primary bg-primary text-primary-foreground" />
          {t("pushLegendAlways")}
        </span>
        <span className="flex items-center gap-2">
          <LegendSwatch className="border-border bg-card text-foreground" />
          {t("legendBorder")}
        </span>
        <span className="flex items-center gap-2">
          <LegendSwatch className="border-border bg-card text-muted-foreground/30" />
          {t("pushLegendOut")}
        </span>
      </div>

      <p className="mt-6 max-w-2xl text-small text-muted-foreground">{t("pushDisclaimer")}</p>
    </>
  );
}

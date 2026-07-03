"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import { isoCellState } from "@/config/poker/iso-chart";
import type { OpenPosition } from "@/config/poker/rfi-chart";
import { cn } from "@/lib/utils";

const SIZE = GRID_RANKS.length; // 13

const POSITIONS: OpenPosition[] = ["UTG", "MP", "HJ", "CO", "BTN", "SB"];

// Эталонный чарт изоляции лимпера (страница /charts, план 2026-07-03, Фаза 1.5).
// Изоляция ≈ RFI-опен минус мелкие пары: 22-66 уходят в оверлимп. Слои: лайм —
// изолируй рейзом; серый яркий — оверлимпни (не изолируй); серый — граница допуска;
// приглушённый — фолд. Из тех же множеств, что детектор (isoCellState).
export function IsoPanel() {
  const t = useTranslations("ReferenceCharts");
  const [pos, setPos] = useState<OpenPosition>("BTN");

  return (
    <>
      <p className="max-w-2xl text-small text-muted-foreground">{t("vsOpenPosLabel")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
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

      <div
        className="mt-6 grid w-full max-w-[420px] select-none gap-px"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: SIZE }).map((_, row) =>
          Array.from({ length: SIZE }).map((__, col) => {
            const code = cellCode(row, col);
            const state = isoCellState(pos, code);
            return (
              <div
                key={code}
                title={`${code}: ${t(`isoCell_${state}`)}`}
                className={cn(
                  "flex aspect-square items-center justify-center border font-mono leading-none",
                  state === "ISO" && "border-primary bg-primary text-primary-foreground",
                  state === "OVERLIMP" && "border-border bg-card text-foreground",
                  state === "BORDER" && "border-border bg-card text-muted-foreground",
                  state === "OUT" && "border-border bg-card text-muted-foreground/30"
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
          <span className="inline-block size-3 border border-primary bg-primary" />
          {t("isoLegendIso")}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 border border-border bg-card" />
          {t("isoLegendOverlimp")}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 border border-border bg-card opacity-60" />
          {t("legendBorder")}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 border border-border bg-card opacity-30" />
          {t("isoLegendOut")}
        </span>
      </div>

      <p className="mt-6 max-w-2xl text-small text-muted-foreground">{t("isoDisclaimer")}</p>
    </>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import { bbCellState, type OpenerPosition } from "@/config/poker/bb-defense-chart";
import { cn } from "@/lib/utils";

const SIZE = GRID_RANKS.length; // 13

const OPENERS: OpenerPosition[] = ["UTG", "MP", "HJ", "CO", "BTN"];

// Эталонный чарт защиты BB против одиночного опена ~2.5bb (страница /charts, план
// 2026-07-03, Фаза 1.5). Переключатель — позиция ОТКРЫВАШКИ. Слои: сплошной лайм —
// 3-бет на велью; лайм-контур — 3-бет-блеф (весом, не обязательный); серый яркий —
// колл; серый тусклее — колл иногда (весовые); приглушённый — фолд. Раскраска из тех
// же множеств, что у детектора (bbCellState) — страница и тренер не могут разойтись.
export function BBDefensePanel() {
  const t = useTranslations("ReferenceCharts");
  const [opener, setOpener] = useState<OpenerPosition>("BTN");

  return (
    <>
      <p className="max-w-2xl text-small text-muted-foreground">{t("bbOpenerLabel")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {OPENERS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setOpener(p)}
            aria-pressed={opener === p}
            className={cn(
              "border px-3 py-2 font-mono text-label uppercase tracking-label transition-colors duration-150 ease-out",
              opener === p
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
            const state = bbCellState(opener, code);
            return (
              <div
                key={code}
                title={`${code}: ${t(`bbCell_${state}`)}`}
                className={cn(
                  "flex aspect-square items-center justify-center border font-mono leading-none",
                  state === "THREEBET" && "border-primary bg-primary text-primary-foreground",
                  state === "THREEBET_BLUFF" && "border-primary bg-card text-primary",
                  state === "CALL" && "border-border bg-card text-foreground",
                  state === "CALL_SOMETIMES" && "border-border bg-card text-muted-foreground",
                  state === "FOLD" && "border-border bg-card text-muted-foreground/30"
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
          <span className="inline-block size-3 border border-primary bg-primary" />
          {t("bbLegendThreebet")}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 border border-primary bg-card" />
          {t("bbLegendThreebetBluff")}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 border border-border bg-card" />
          {t("bbLegendCall")}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 border border-border bg-card opacity-60" />
          {t("bbLegendCallSometimes")}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 border border-border bg-card opacity-30" />
          {t("bbLegendFold")}
        </span>
      </div>

      <p className="mt-6 max-w-2xl text-small text-muted-foreground">{t("bbDisclaimer")}</p>
    </>
  );
}

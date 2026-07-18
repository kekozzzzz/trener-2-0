"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import { pushCellState } from "@/config/poker/push-fold-chart";
import { restealCellState } from "@/config/poker/resteal-chart";
import type { PushRangeSpot } from "@/parser/push-range-spot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIZE = GRID_RANKS.length; // 13

// Унифицированное состояние ячейки для отрисовки: пуш / пуш-часть-времени / граница / фолд.
type Cell = "CORE" | "WEIGHT" | "BORDER" | "OUT";

function cellFor(spot: PushRangeSpot, code: string): Cell {
  if (spot.kind === "openshove") {
    const s = pushCellState(spot.band, spot.position, code);
    return s === "ALWAYS" ? "CORE" : s === "BORDER" ? "BORDER" : "OUT";
  }
  const s = restealCellState(spot.openerGroup, spot.band, code);
  return s === "JAM" ? "CORE" : s === "JAM_WEIGHT" ? "WEIGHT" : s === "BORDER" ? "BORDER" : "OUT";
}

// Панель «эталонный диапазон для этого спота» на странице разбора раздачи (Артём 18.07): по кнопке
// разворачивается сетка 13×13, где подсвечено, чем в этом споте пушат/рестилят, и отдельно — рука
// игрока. Опционально (не простыня) и ПОСЛЕ разбора — не подсказывает ответ заранее. Раскраска из
// тех же чартов, что у детекторов и публичной /charts, — разойтись не могут.
export function PushRangePanel({ spot }: { spot: PushRangeSpot }) {
  const t = useTranslations("PushRange");
  const [open, setOpen] = useState(false);

  const spotLabel =
    spot.kind === "openshove"
      ? t("spotOpenshove", { pos: spot.position === "MP2" ? "MP" : spot.position })
      : t("spotResteal", { opener: t(spot.openerGroup === "EARLY" ? "openerEarly" : "openerLate") });

  if (!open) {
    return (
      <div className="mt-6">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {t("button")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 border border-border bg-card p-4">
      <p className="font-mono text-label uppercase tracking-label text-muted-foreground">{t("title")}</p>
      <p className="mt-1 text-small text-foreground">{spotLabel}</p>

      <div
        className="mt-4 grid w-full max-w-[420px] select-none gap-px"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: SIZE }).map((_, row) =>
          Array.from({ length: SIZE }).map((__, col) => {
            const code = cellCode(row, col);
            const state = cellFor(spot, code);
            const isHero = code === spot.heroCode;
            return (
              <div
                key={code}
                title={isHero ? `${code}: ${t("yourHand")}` : code}
                className={cn(
                  "relative flex aspect-square items-center justify-center border font-mono leading-none",
                  state === "CORE" && "border-primary bg-primary text-primary-foreground",
                  state === "WEIGHT" && "border-primary/60 bg-primary/30 text-foreground",
                  state === "BORDER" && "border-border bg-card text-foreground",
                  state === "OUT" && "border-border bg-card text-muted-foreground/30",
                  // Твоя рука — жирная рамка поверх любой заливки, чтобы найти её взглядом.
                  isHero && "z-10 ring-2 ring-inset ring-foreground",
                )}
              >
                <span className="text-[0.5rem] sm:text-[0.65rem]">{code}</span>
              </div>
            );
          }),
        )}
      </div>

      {/* Легенда */}
      <div className="mt-4 flex flex-col gap-1.5 text-small text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 border border-primary bg-primary" />
          {t("legendCore")}
        </span>
        {spot.kind === "resteal" && (
          <span className="flex items-center gap-2">
            <span className="inline-block size-3 border border-primary/60 bg-primary/30" />
            {t("legendWeight")}
          </span>
        )}
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 border border-border bg-card" />
          {t("legendBorder")}
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 border-2 border-foreground bg-card" />
          {t("yourHand")}
        </span>
      </div>

      <p className="mt-4 max-w-2xl text-small text-muted-foreground">{t("note")}</p>
    </div>
  );
}

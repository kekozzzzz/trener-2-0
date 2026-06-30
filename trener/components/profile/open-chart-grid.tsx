"use client";

import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import { OPEN_CHART_FLAG_MIN_COUNT } from "@/config/profile";
import type { OpenChartCell } from "@/features/profile/open-chart";
import { cn } from "@/lib/utils";

const SIZE = GRID_RANKS.length; // 13

// Read-only сетка 169 рук — зеркало «как ты открываешься» из одной позиции.
// Раскраска по дизайн-системе (один акцент — лайм):
//   лайм-заливка  — открываешь шире нормы, выборки хватает (сигнал, «найденный спот»);
//   лайм-контур   — шире нормы, но открыто мало раз (звоночек, не приговор);
//   серый-яркий   — открываешь в рамках нормы;
//   приглушённый  — отсюда эту руку не открываешь.
// Базовый RFI-чарт как «эталон» НЕ рисуем — он лишь решил флаг wide в агрегаторе.
export function OpenChartGrid({ cells }: { cells: OpenChartCell[] }) {
  const byCode = new Map(cells.map((c) => [c.code, c]));

  return (
    <div
      className="grid w-full max-w-[420px] select-none gap-px"
      style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: SIZE }).map((_, row) =>
        Array.from({ length: SIZE }).map((__, col) => {
          const code = cellCode(row, col);
          const cell = byCode.get(code);
          const opened = !!cell && cell.count > 0;
          const flagged = !!cell && cell.wide && cell.count >= OPEN_CHART_FLAG_MIN_COUNT;
          const thin = !!cell && cell.wide && cell.count < OPEN_CHART_FLAG_MIN_COUNT;

          return (
            <div
              key={code}
              title={cell ? `${code}: открыто ${cell.count}` : code}
              className={cn(
                "flex aspect-square flex-col items-center justify-center border font-mono leading-none",
                flagged && "border-primary bg-primary text-primary-foreground",
                thin && "border-primary bg-card text-primary",
                opened && !flagged && !thin && "border-border bg-card text-foreground",
                !opened && "border-border bg-card text-muted-foreground/30"
              )}
            >
              <span className="text-[0.5rem] sm:text-[0.65rem]">{code}</span>
              {cell && cell.wide && (
                <span className="text-[0.4rem] sm:text-[0.5rem]">×{cell.count}</span>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

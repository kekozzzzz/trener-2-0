"use client";

import { useCallback, useRef, useState } from "react";
import { GRID_RANKS, cellCode, combosOf, percentOf } from "@/config/poker/hand-grid";
import { cn } from "@/lib/utils";

const SIZE = GRID_RANKS.length; // 13

// Сетка 169 стартовых рук как форма ввода: игрок кликает (или протягивает мышью)
// руки, которые даёт оппоненту. Внутреннее состояние — Set кодов; наверх отдаём
// плоский список через onChange. «N комбо · X%» считает код (config/poker/hand-grid).
export function RangeGrid({ onChange }: { onChange?: (codes: string[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Режим протягивания: true — добавляем руки под курсором, false — снимаем,
  // null — не тащим. Ref, чтобы не пере-рендерить во время движения.
  const paintMode = useRef<boolean | null>(null);

  const update = useCallback(
    (fn: (prev: Set<string>) => Set<string>) => {
      setSelected((prev) => {
        const next = fn(prev);
        onChange?.([...next]);
        return next;
      });
    },
    [onChange]
  );

  const setCell = useCallback(
    (code: string, on: boolean) =>
      update((prev) => {
        if (on === prev.has(code)) return prev; // уже в нужном состоянии
        const next = new Set(prev);
        if (on) next.add(code);
        else next.delete(code);
        return next;
      }),
    [update]
  );

  const startPaint = useCallback(
    (code: string) => {
      const willSelect = !selected.has(code);
      paintMode.current = willSelect;
      setCell(code, willSelect);
    },
    [selected, setCell]
  );

  const paintOver = useCallback(
    (code: string) => {
      if (paintMode.current !== null) setCell(code, paintMode.current);
    },
    [setCell]
  );

  const endPaint = useCallback(() => {
    paintMode.current = null;
  }, []);

  const combos = combosOf(selected);
  const percent = percentOf(selected);

  return (
    <div className="max-w-[400px] space-y-3" onPointerUp={endPaint} onPointerLeave={endPaint}>
      <div
        className="grid touch-none select-none gap-px"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: SIZE }).map((_, row) =>
          Array.from({ length: SIZE }).map((__, col) => {
            const code = cellCode(row, col);
            const isOn = selected.has(code);
            return (
              <button
                key={code}
                type="button"
                aria-pressed={isOn}
                aria-label={code}
                onPointerDown={(e) => {
                  e.preventDefault();
                  startPaint(code);
                }}
                onPointerEnter={() => paintOver(code)}
                className={cn(
                  "aspect-square border font-mono text-[0.5rem] leading-none transition-colors duration-75 sm:text-[0.65rem]",
                  isOn
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary"
                )}
              >
                {code}
              </button>
            );
          })
        )}
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="font-mono text-small text-muted-foreground">
          {combos > 0 ? (
            <>
              <span className="text-primary">{combos}</span> комбо · {percent.toFixed(1)}%
            </>
          ) : (
            "Отметь руки на сетке"
          )}
        </p>
        {combos > 0 && (
          <button
            type="button"
            onClick={() => update(() => new Set())}
            className="font-mono text-label uppercase tracking-label text-muted-foreground transition-colors hover:text-foreground"
          >
            Очистить
          </button>
        )}
      </div>
    </div>
  );
}

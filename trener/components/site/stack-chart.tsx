"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { pickIndexes, smoothValues, smoothPath } from "@/lib/sparkline";
import type { StackPoint } from "@/features/tournaments/stack-curve";

// Интерактивная линия стека — заказ Артёма 2026-08-09:
// «стек ровный-ровный, потом упал — а что я такого сделал?». Наведение показывает,
// что за раздача стоит под курсором, клик открывает её разбор.
//
// Кликабельны только раздачи с готовым разбором (hasReview): у остальных страницы
// разбора просто нет, ссылка вела бы в 404. Такие точки показываем, но не ведём.

export type StackChartLabels = {
  /** «Раздача {number}» */
  hand: string;
  /** «{stack} BB в стеке» */
  stack: string;
  /** «{sign}{delta} BB за раздачу» */
  delta: string;
  /** «Открыть разбор» */
  open: string;
  /** «Разбор этой раздачи не делали» */
  noReview: string;
  /** «Ты здесь» — подпись текущей раздачи */
  current: string;
};

const VIEW_WIDTH = 320;

export function StackChart({
  points,
  currentIndex,
  hrefBase,
  labels,
  height = 96,
  className,
}: {
  points: StackPoint[];
  currentIndex: number | null;
  /** Префикс ссылки на раздачу: «/tournament/<id>/hands/». */
  hrefBase: string;
  labels: StackChartLabels;
  height?: number;
  className?: string;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  // Прореживание и сглаживание — та же математика, что у обычного спарклайна
  // (lib/sparkline.ts): 200+ точек превращают линию в частокол.
  const chart = useMemo(() => {
    const values = points.map((p) => p.stackBb);
    const indexes = pickIndexes(values, currentIndex ?? undefined);
    const shown = indexes.map((i) => points[i]);
    const markAt = currentIndex == null ? undefined : indexes.indexOf(currentIndex);
    const smoothed = smoothValues(
      shown.map((p) => p.stackBb),
      markAt
    );

    const max = Math.max(...smoothed);
    const min = Math.min(...smoothed);
    const span = max - min || 1;
    const stepX = VIEW_WIDTH / (smoothed.length - 1);
    const toY = (value: number) => height - 8 - ((value - min) / span) * (height - 16);

    return {
      shown,
      markAt: markAt === -1 ? undefined : markAt,
      stepX,
      coords: smoothed.map((value, i) => ({ x: i * stepX, y: toY(value) })),
    };
  }, [points, currentIndex, height]);

  const active = hover != null ? chart.shown[hover] : null;
  const activeCoord = hover != null ? chart.coords[hover] : null;

  function nearestIndex(clientX: number): number | null {
    const rect = box.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const ratio = (clientX - rect.left) / rect.width;
    const index = Math.round(ratio * (chart.shown.length - 1));
    return Math.max(0, Math.min(chart.shown.length - 1, index));
  }

  function openHand(point: StackPoint | null) {
    if (!point?.hasReview) return;
    router.push(`${hrefBase}${point.handId}`);
  }

  // Тултип у краёв прижимаем к своей стороне, иначе он вылезет за график.
  const tipSide =
    hover == null ? "center" : hover < chart.shown.length * 0.2 ? "left" : hover > chart.shown.length * 0.8 ? "right" : "center";

  return (
    <div className={cn("relative", className)}>
      <div
        ref={box}
        role="group"
        tabIndex={0}
        aria-label={labels.hand.replace("{number}", String(active?.number ?? ""))}
        className={cn(
          "relative outline-none",
          active?.hasReview ? "cursor-pointer" : "cursor-default",
          "focus-visible:ring-1 focus-visible:ring-primary"
        )}
        style={{ height }}
        onMouseMove={(e) => setHover(nearestIndex(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onClick={() => openHand(active)}
        // Тач: первое касание показывает подсказку, повторное по той же точке — открывает.
        onTouchStart={(e) => {
          const index = nearestIndex(e.touches[0].clientX);
          if (index != null && index === hover) openHand(chart.shown[index]);
          else setHover(index);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const step = e.key === "ArrowRight" ? 1 : -1;
            const from = hover ?? chart.markAt ?? 0;
            setHover(Math.max(0, Math.min(chart.shown.length - 1, from + step)));
          }
          if (e.key === "Enter") openHand(active);
        }}
      >
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${height}`}
          width="100%"
          height={height}
          preserveAspectRatio="none"
          aria-hidden
          className="block"
        >
          <path
            d={smoothPath(chart.coords)}
            fill="none"
            stroke="#D4FF33"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {chart.markAt != null && (
            <line
              x1={chart.markAt * chart.stepX}
              y1={0}
              x2={chart.markAt * chart.stepX}
              y2={height}
              stroke="#2A2A2A"
              strokeWidth={1}
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {activeCoord && (
            <line
              x1={activeCoord.x}
              y1={0}
              x2={activeCoord.x}
              y2={height}
              stroke="#D4FF33"
              strokeWidth={1}
              strokeOpacity={0.4}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Маркеры поверх SVG: полотно растянуто по ширине, квадрат внутри него
            превратился бы в прямоугольник. */}
        {chart.markAt != null && (
          <span
            aria-hidden
            className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 bg-primary"
            style={{
              left: `${((chart.markAt * chart.stepX) / VIEW_WIDTH) * 100}%`,
              top: `${(chart.coords[chart.markAt].y / height) * 100}%`,
            }}
          />
        )}
        {activeCoord && (
          <span
            aria-hidden
            className="absolute size-[9px] -translate-x-1/2 -translate-y-1/2 border border-primary bg-background"
            style={{
              left: `${(activeCoord.x / VIEW_WIDTH) * 100}%`,
              top: `${(activeCoord.y / height) * 100}%`,
            }}
          />
        )}
      </div>

      {/* Подсказка. Место под неё зарезервировано всегда — иначе блок под графиком
          прыгает при каждом наведении. */}
      <div className="mt-2 min-h-[76px]">
        {active ? (
          <div
            className={cn(
              "inline-block border border-border bg-card p-3",
              tipSide === "right" && "float-right",
              tipSide === "center" && ""
            )}
          >
            <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
              {labels.hand.replace("{number}", String(active.number))}
              {hover === chart.markAt && ` · ${labels.current}`}
            </p>
            <p className="mt-1 font-mono text-body text-foreground">
              {active.cards.length > 0 && <span className="mr-3">{formatCards(active.cards)}</span>}
              {labels.stack.replace("{stack}", String(active.stackBb))}
            </p>
            {active.deltaBb != null && active.deltaBb !== 0 && (
              <p
                className={cn(
                  "mt-1 font-mono text-small",
                  active.deltaBb > 0 ? "text-primary" : "text-muted-foreground"
                )}
              >
                {labels.delta
                  .replace("{sign}", active.deltaBb > 0 ? "+" : "−")
                  .replace("{delta}", String(Math.abs(active.deltaBb)))}
              </p>
            )}
            <p className="mt-2 font-mono text-label uppercase tracking-label">
              {active.hasReview ? (
                <span className="text-primary">{labels.open} →</span>
              ) : (
                <span className="text-muted-foreground">{labels.noReview}</span>
              )}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// «5s 5h» → «5♠ 5♥». Масти рисуем знаками, как в остальном интерфейсе.
const SUITS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

function formatCards(cards: string[]): string {
  return cards.map((card) => `${card.slice(0, -1)}${SUITS[card.slice(-1)] ?? ""}`).join(" ");
}

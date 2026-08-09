"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { pickIndexes, smoothValues, smoothPath, smoothingWindow } from "@/lib/sparkline";
import type { StackPoint } from "@/features/tournaments/stack-curve";

// Интерактивная линия стека — заказ Артёма 2026-08-09:
// «стек ровный-ровный, потом упал — а что я такого сделал?». Наведение показывает,
// что за раздача стоит под курсором, клик открывает её разбор.
//
// Линия в ФИШКАХ, а не в больших блайндах (решение Артёма): блайнды растут быстрее
// стека, поэтому в BB даже удачный турнир выглядит как непрерывное падение. Глубина
// в BB никуда не делась — она в карточке точки.
//
// Разобранные раздачи помечены на линии заранее (правка Артёма: «идёшь по линии и
// рандомно натыкаешься на руку, которую можно разобрать»). Кликабельны только они:
// у остальных страницы разбора нет, ссылка вела бы в 404.

export type StackChartLabels = {
  /** «Раздача {number}» */
  hand: string;
  /** «{chips} фишек» */
  chips: string;
  /** «{stack} BB в стеке» */
  stack: string;
  /** «{sign}{delta} фишек за раздачу» */
  delta: string;
  /** «Открыть разбор» */
  open: string;
  /** «Эту раздачу не разбирали» */
  noReview: string;
  /** «ты здесь» */
  current: string;
  /** «Точки — разобранные раздачи, по ним можно кликнуть» */
  legend: string;
};

const VIEW_WIDTH = 320;

// Потолок точек — предохранитель на аномально длинный турнир, а не средство сглаживания.
// Обычный MTT укладывается в 200-300 раздач и рисуется целиком.
const MAX_HAND_POINTS = 400;

// Разряды бьём узким неразрывным пробелом вручную, а не toLocaleString: формат обязан
// совпасть на сервере и в браузере, иначе React ругается на расхождение разметки.
function formatChips(value: number): string {
  const sign = value < 0 ? "−" : "";
  return sign + Math.abs(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

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

  // Линия идёт по ВСЕМ раздачам турнира (правка Артёма 2026-08-09: «между метками
  // тоже были раздачи, хочется видеть, какие руки выкидывал»). Прореживание осталось
  // только предохранителем на гигантский турнир — и разобранные раздачи в нём
  // защищены от выбрасывания, иначе пропала бы метка и дверь в разбор.
  //
  // Пилу гасим не выбрасыванием точек, а усреднением: окно тем шире, чем длиннее ряд.
  const chart = useMemo(() => {
    const values = points.map((p) => p.stackChips);
    const reviewed = points.map((p, i) => (p.hasReview ? i : -1)).filter((i) => i >= 0);
    const indexes = pickIndexes(values, currentIndex ?? undefined, reviewed, MAX_HAND_POINTS);
    const shown = indexes.map((i) => points[i]);
    const markIndex = currentIndex == null ? -1 : indexes.indexOf(currentIndex);
    const markAt = markIndex === -1 ? undefined : markIndex;
    const series = shown.map((p) => p.stackChips);
    // Точку под маркером не оберегаем: при полном ряде это дало бы одинокий зубец.
    // Точное число всё равно стоит подписью в карточке — линия отвечает за форму.
    const smoothed = smoothValues(series, undefined, smoothingWindow(series.length));

    const max = Math.max(...smoothed);
    const min = Math.min(...smoothed);
    const span = max - min || 1;
    const stepX = VIEW_WIDTH / (smoothed.length - 1);
    const toY = (value: number) => height - 8 - ((value - min) / span) * (height - 16);

    return {
      shown,
      markAt,
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
    const clamped = Math.max(0, Math.min(chart.shown.length - 1, index));

    // Примагничиваем к разобранной раздаче, если она рядом: метки — цель наведения,
    // и промахнуться по ним обиднее, чем чуть сдвинуть подсказку. Радиус — в точках,
    // но растёт с длиной ряда, чтобы на экране он оставался примерно теми же пикселями.
    if (chart.shown[clamped]?.hasReview) return clamped;
    const reach = Math.max(2, Math.round(chart.shown.length / 80));
    for (let offset = 1; offset <= reach; offset++) {
      if (chart.shown[clamped - offset]?.hasReview) return clamped - offset;
      if (chart.shown[clamped + offset]?.hasReview) return clamped + offset;
    }
    return clamped;
  }

  function openHand(point: StackPoint | null) {
    if (!point?.hasReview) return;
    router.push(`${hrefBase}${point.handId}`);
  }

  const tipSide =
    hover == null
      ? "center"
      : hover > chart.shown.length * 0.65
        ? "right"
        : "left";

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

        {/* Метки поверх SVG: полотно растянуто по ширине, фигуры внутри него
            превратились бы в приплюснутые. */}
        {chart.shown.map((point, i) =>
          point.hasReview ? (
            <span
              key={point.handId}
              aria-hidden
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 border border-primary",
                i === chart.markAt ? "size-[7px] bg-primary" : "size-[5px] bg-background",
                hover === i && "size-[9px]"
              )}
              style={{
                left: `${((i * chart.stepX) / VIEW_WIDTH) * 100}%`,
                top: `${(chart.coords[i].y / height) * 100}%`,
              }}
            />
          ) : null
        )}

        {/* Текущая раздача помечается всегда — даже если её разбор ещё не готов */}
        {chart.markAt != null && !chart.shown[chart.markAt].hasReview && (
          <span
            aria-hidden
            className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 bg-primary"
            style={{
              left: `${((chart.markAt * chart.stepX) / VIEW_WIDTH) * 100}%`,
              top: `${(chart.coords[chart.markAt].y / height) * 100}%`,
            }}
          />
        )}

        {/* Курсорный маркер на точке без разбора — тонкая рамка, чтобы отличался от меток */}
        {activeCoord && !active?.hasReview && (
          <span
            aria-hidden
            className="absolute size-[9px] -translate-x-1/2 -translate-y-1/2 border border-muted-foreground bg-background"
            style={{
              left: `${(activeCoord.x / VIEW_WIDTH) * 100}%`,
              top: `${(activeCoord.y / height) * 100}%`,
            }}
          />
        )}
      </div>

      {/* Подсказка. Место под неё зарезервировано всегда — иначе блок под графиком
          прыгает при каждом наведении. */}
      <div className="mt-2 min-h-[92px]">
        {active ? (
          <div
            className={cn(
              "inline-block border bg-card p-3",
              active.hasReview ? "border-primary" : "border-border",
              tipSide === "right" && "float-right"
            )}
          >
            <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
              {labels.hand.replace("{number}", String(active.number))}
              {hover === chart.markAt && ` · ${labels.current}`}
            </p>
            <p className="mt-1 font-mono text-body text-foreground">
              {active.cards.length > 0 && <span className="mr-3">{formatCards(active.cards)}</span>}
              {labels.chips.replace("{chips}", formatChips(active.stackChips))}
            </p>
            <p className="mt-1 font-mono text-small text-muted-foreground">
              {active.stackBb != null && labels.stack.replace("{stack}", String(active.stackBb))}
              {active.deltaChips != null && active.deltaChips !== 0 && (
                <span className={cn("ml-3", active.deltaChips > 0 ? "text-primary" : "text-foreground")}>
                  {labels.delta
                    .replace("{sign}", active.deltaChips > 0 ? "+" : "−")
                    .replace("{delta}", formatChips(Math.abs(active.deltaChips)))}
                  {active.deltaBb != null && ` (${active.deltaBb > 0 ? "+" : "−"}${Math.abs(active.deltaBb)} BB)`}
                </span>
              )}
            </p>
            <p className="mt-2 font-mono text-label uppercase tracking-label">
              {active.hasReview ? (
                <span className="text-primary">{labels.open} →</span>
              ) : (
                <span className="text-muted-foreground">{labels.noReview}</span>
              )}
            </p>
          </div>
        ) : (
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            <span aria-hidden className="mr-2 inline-block size-[5px] border border-primary align-middle" />
            {labels.legend}
          </p>
        )}
      </div>
    </div>
  );
}

// «5s 5h» → «5♠ 5♥». Масти рисуем знаками, как в остальном интерфейсе.
const SUITS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

function formatCards(cards: string[]): string {
  return cards.map((card) => `${card.slice(0, -1)}${SUITS[card.slice(-1)] ?? ""}`).join(" ");
}

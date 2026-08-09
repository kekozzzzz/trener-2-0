import { cn } from "@/lib/utils";
import { thinPoints, smoothPath, smoothValues } from "@/lib/sparkline";

// Спарклайн — design-system.md §4.1 п. 9. Линия динамики во времени: стек по ходу
// турнира, прогресс. Отметка события — пунктирная вертикаль и квадратный маркер.
//
// Чисто вычислительный компонент: числа приходят готовыми (правило проекта 1 —
// считает код, не разметка и не ИИ). Пустой массив ничего не рисует.

export function Sparkline({
  values,
  markAt,
  height = 56,
  className,
}: {
  /** Значения по порядку — например, стек героя после каждой раздачи. */
  values: number[];
  /** Индекс точки события: где случился разбираемый спот. */
  markAt?: number;
  height?: number;
  className?: string;
}) {
  if (values.length < 2) return null;

  // Порядок важен: сначала режем лишние точки, потом усредняем то, что осталось —
  // иначе усреднение размывает провал, который прореживание как раз старается сберечь.
  const thinned = thinPoints(values, markAt);
  const mark = thinned.markAt;
  const series = smoothValues(thinned.values, mark);

  const width = 320;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const span = max - min || 1;
  const stepX = width / (series.length - 1);
  // Поля сверху и снизу по 6px, чтобы линия не липла к краям рамки.
  const toY = (value: number) => height - 6 - ((value - min) / span) * (height - 12);

  const points = series.map((value, i) => ({ x: i * stepX, y: toY(value) }));

  const markX = mark != null && series[mark] != null ? mark * stepX : null;
  const markY = mark != null && series[mark] != null ? toY(series[mark]) : null;

  return (
    // Маркер вынесен из SVG: полотно растянуто по ширине (preserveAspectRatio="none"),
    // и квадрат внутри него превратился бы в приплюснутый прямоугольник.
    <div className={cn("relative", className)} style={{ height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        aria-hidden
        className="block"
      >
        <path
          // Линия прочерчивается один раз при загрузке — тот же приём, что у появления
          // результатов парсера (§5 п. 3). Без JS: чистая CSS-анимация по stroke-dashoffset.
          className="spark-draw"
          d={smoothPath(points)}
          fill="none"
          stroke="#D4FF33"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          // Без этого растяжение полотна утолщает линию по горизонтали и она выглядит рваной.
          vectorEffect="non-scaling-stroke"
        />
        {markX != null && (
          <line
            x1={markX}
            y1={0}
            x2={markX}
            y2={height}
            stroke="#2A2A2A"
            strokeWidth={1}
            strokeDasharray="2 3"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {markX != null && markY != null && (
        <span
          aria-hidden
          className="absolute size-[7px] -translate-x-1/2 -translate-y-1/2 bg-primary"
          style={{ left: `${(markX / width) * 100}%`, top: `${(markY / height) * 100}%` }}
        />
      )}
    </div>
  );
}

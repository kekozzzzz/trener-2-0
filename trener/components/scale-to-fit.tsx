"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

// Вписывает содержимое фиксированной «эталонной» ширины в реальную ширину
// контейнера, масштабируя блок целиком (transform: scale). Нужно там, где
// внутренняя вёрстка в фиксированных px не должна ужиматься по частям (иначе
// элементы наезжают) — вместо горизонтальной прокрутки весь блок пропорционально
// уменьшается и всегда виден полностью. На широком экране масштаб не превышает 1.
//
// transform не влияет на поток, поэтому высоту внешнего блока задаём вручную —
// иначе под уменьшенным столом остаётся пустота.
export function ScaleToFit({ baseWidth, children }: { baseWidth: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState<number | undefined>(undefined);
  // Когда контейнер шире эталонной ширины (scale упирается в 1), блок иначе
  // прилипает к левому краю, а не стоит по центру окна (правка Артёма 2026-08-13,
  // криво на широком мониторе). Свободную ширину добавляем как сдвиг вправо.
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const outerEl = outer.current;
    const innerEl = inner.current;
    if (!outerEl || !innerEl) return;

    const update = () => {
      const containerWidth = outerEl.clientWidth;
      const s = Math.min(1, containerWidth / baseWidth);
      setScale(s);
      setOffset(Math.max(0, (containerWidth - baseWidth * s) / 2));
      setHeight(innerEl.offsetHeight * s);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(outerEl);
    return () => ro.disconnect();
  }, [baseWidth]);

  // overflow: hidden обрезает «пустой» layout-хвост: transform не меняет размер
  // блока в потоке (inner остаётся baseWidth px), а масштабированное содержимое
  // занимает ровно ширину контейнера — обрезается только невидимая пустота справа,
  // иначе на узком экране широкий блок дал бы прокрутку страницы.
  return (
    <div ref={outer} style={{ height, overflow: "hidden" }}>
      <div
        ref={inner}
        style={{
          width: baseWidth,
          transformOrigin: "top left",
          transform: `translateX(${offset}px) scale(${scale})`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

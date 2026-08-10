"use client";

import { useEffect, useRef } from "react";

// Мягкое пятно света, идущее за курсором. Приём из стороннего макета, который принёс
// Артём 2026-08-09 («например, подсветку за курсором»).
//
// Почему это не спорит с дизайн-системой: §3 разрешает глубину «точечным гало
// акцентом» — это свет, а не элемент интерфейса. Ни рамок, ни скруглений у него нет,
// цвет строго акцентный, и он ничего не перекрывает (pointer-events: none).
//
// Только для мыши: на тач-экране курсора нет, и вешать слушатель незачем.
// prefers-reduced-motion выключает эффект целиком.
export function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let x = 0;
    let y = 0;
    let frame = 0;

    // Позицию пишем не на каждое движение мыши, а раз в кадр: mousemove стреляет
    // сотни раз в секунду, и без этого браузер пересчитывает стили вхолостую.
    const draw = () => {
      frame = 0;
      el.style.transform = `translate3d(${x - 125}px, ${y - 125}px, 0)`;
    };

    const onMove = (event: MouseEvent) => {
      x = event.clientX;
      y = event.clientY;
      el.style.opacity = "1";
      if (!frame) frame = requestAnimationFrame(draw);
    };

    const onLeave = () => {
      el.style.opacity = "0";
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return <div ref={ref} aria-hidden className="cursor-glow" />;
}

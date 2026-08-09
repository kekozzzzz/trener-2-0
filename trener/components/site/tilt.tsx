"use client";

import { useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

// Карточка, которая слегка поворачивается под курсором и подсвечивается в точке
// наведения. Приём из стороннего макета (Артём 2026-08-09: «как карточки там
// двигаются, когда на них наводишь»).
//
// Наклон умышленно маленький — 4 градуса. У нас прямые углы и тонкие линии: сильный
// разворот на таком языке выглядит как игрушка, а не как прибор. Задача — дать
// ощущение отзывчивости, а не аттракцион.
//
// Тач-экран не трогаем (наклон некуда применять), reduced-motion — тоже: там
// остаётся статичная карточка.
const MAX_TILT = 4;

export function Tilt({
  children,
  className,
  glow = true,
}: {
  children: ReactNode;
  className?: string;
  /** Подсветка в точке курсора внутри карточки. */
  glow?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);

  function onMove(event: React.MouseEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const rect = el.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;

    if (frame.current) return; // не чаще одного раза в кадр
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      el.style.transform = `perspective(1000px) rotateX(${(py - 0.5) * -MAX_TILT}deg) rotateY(${
        (px - 0.5) * MAX_TILT
      }deg)`;
      el.style.setProperty("--gx", `${px * 100}%`);
      el.style.setProperty("--gy", `${py * 100}%`);
    });
  }

  function onLeave() {
    const el = ref.current;
    if (!el) return;
    el.style.transform = "";
  }

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn("tilt", glow && "tilt-glow", className)}
    >
      {children}
    </div>
  );
}

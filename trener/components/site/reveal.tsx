"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Появление по скроллу — design-system.md §5 п. 4 (разрешено 2026-08-08).
//
// Важное отличие от BlurFade: тот рендерит скрытое состояние сразу, поэтому без JS
// страница осталась бы пустой. Здесь наоборот — разметка приходит видимой, и только
// после гидрации скрипт прячет блоки, которые ещё не доехали до экрана. Робот
// поисковика и браузер без JS видят полный текст.
//
// Блок, который уже виден при загрузке (первый экран), не трогаем совсем — иначе он
// мигнёт: сначала спрячется, потом проявится.
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** Задержка в миллисекундах — соседям в одном ряду даём лесенку по 60ms. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Уже на экране — оставляем как есть.
    if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    el.dataset.reveal = "hidden";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          window.setTimeout(() => {
            el.dataset.reveal = "shown";
          }, delay);
          observer.unobserve(el); // один раз: назад блок уже не прячется
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

"use client";

import { useEffect } from "react";

// Сканирующая подсветка — design-system.md §4.1 п. 14. Прототип одобрен Артёмом
// 2026-08-18 (design/scroll-highlight-preview.html): полоса чуть ниже статус-строки
// «сканирует» страницу — любой элемент с data-glow, проезжая через неё, получает
// класс is-lit (цвет/аура из globals.css), а уезжая — теряет его. Работает в обе
// стороны скролла и на тач-экранах — это не курсорный эффект.
//
// Один IntersectionObserver с узким rootMargin вместо scroll-листенера: браузер
// сам решает, когда пересчитывать пересечения, а не мы на каждый пиксель скролла.
const ZONE_TOP = 186;
const ZONE_HEIGHT = 80;

export function ScrollGlow() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let observer: IntersectionObserver | null = null;

    function setup() {
      observer?.disconnect();
      const bottomMargin = window.innerHeight - (ZONE_TOP + ZONE_HEIGHT);
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            entry.target.classList.toggle("is-lit", entry.isIntersecting);
          }
        },
        {
          root: null,
          rootMargin: `-${ZONE_TOP}px 0px -${Math.max(bottomMargin, 0)}px 0px`,
          threshold: 0,
        }
      );
      document.querySelectorAll("[data-glow]").forEach((el) => observer!.observe(el));
    }

    setup();
    window.addEventListener("resize", setup);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", setup);
    };
  }, []);

  return null;
}

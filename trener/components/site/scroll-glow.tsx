"use client";

import { useEffect } from "react";

// Сканирующая подсветка — design-system.md §4.1 п. 14. Полоса чуть ниже
// статус-строки «сканирует» страницу: элемент с data-glow, проезжая через
// неё, получает класс is-lit, уезжает — теряет его.
//
// Первая версия строилась на IntersectionObserver с узким rootMargin (80px).
// На практике браузер не гарантирует своевременную доставку колбэков для
// такой тонкой полосы при обычной скорости скролла: часть блоков вообще не
// успевала загореться, другие «залипали» подсвеченными на сотни лишних
// пикселей после того, как реально покинули зону (баг найден Артёмом
// 2026-08-18: «проходит линию, и всё — выше линии уже не работает», причём
// и на телефоне, и на компьютере — не Safari-специфика).
//
// Теперь позиция каждого элемента считается на каждом кадре скролла
// (requestAnimationFrame) и сравнивается с фиксированной зоной напрямую —
// детерминированно, не зависит от скорости скролла и throttling браузера.
const ZONE_TOP = 186;
const ZONE_HEIGHT = 80;
const ZONE_BOTTOM = ZONE_TOP + ZONE_HEIGHT;

export function ScrollGlow() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-glow]"));
    if (els.length === 0) return;

    let frame = 0;

    function check() {
      frame = 0;
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        const inZone = rect.bottom > ZONE_TOP && rect.top < ZONE_BOTTOM;
        el.classList.toggle("is-lit", inZone);
      }
    }

    function onScroll() {
      if (!frame) frame = requestAnimationFrame(check);
    }

    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return null;
}

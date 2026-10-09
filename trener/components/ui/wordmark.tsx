import { cn } from "@/lib/utils";

// Лого бренда = знак + вордмарк. Знак — «grid»: 2×2 сетка, три ячейки в белой обводке +
// одна лаймовая (утверждён 2026-06-23, design/logo-favicon-preview.html, design-system §7).
// Вордмарк: Inter 900, капсом, «WHY» акцентным лаймом, «GRID» основным цветом. Один
// компонент на все шапки/подвал, чтобы бренд не расходился по страницам. Размер знака
// привязан к кеглю (1em), поэтому масштабируется вместе с текстом при override через className.
//
// Анимация знака (решение Артёма 2026-10-09, design-system §5 п.6): один проход лаймовой ячейки по
// часовой стрелке при загрузке страницы и при наведении, без цикла. Каждая ячейка несёт и заливку,
// и обводку, а «лайм или обводка» переключается через fill-opacity/stroke-opacity - в покое вид тот же,
// что был (верх-право залита, остальные в обводке). Сами keyframes - app/globals.css, блок «Знак логотипа».
function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "wm inline-flex items-center gap-[0.4em] font-sans text-[1.125rem] font-black uppercase leading-none tracking-tight",
        className
      )}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" className="size-[1em] shrink-0">
        <rect x="14" y="14" width="32" height="32" fillOpacity="0" strokeOpacity="1" strokeWidth="7" className="wm-cell wm-tl fill-primary stroke-foreground" />
        <rect x="54" y="14" width="32" height="32" fillOpacity="1" strokeOpacity="0" strokeWidth="7" className="wm-cell wm-tr fill-primary stroke-foreground" />
        <rect x="14" y="54" width="32" height="32" fillOpacity="0" strokeOpacity="1" strokeWidth="7" className="wm-cell wm-bl fill-primary stroke-foreground" />
        <rect x="54" y="54" width="32" height="32" fillOpacity="0" strokeOpacity="1" strokeWidth="7" className="wm-cell wm-br fill-primary stroke-foreground" />
      </svg>
      <span>
        <span className="text-primary">Why</span>
        <span className="text-foreground">grid</span>
      </span>
    </span>
  );
}

export { Wordmark };

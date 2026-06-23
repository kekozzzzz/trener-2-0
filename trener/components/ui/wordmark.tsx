import { cn } from "@/lib/utils";

// Лого бренда = знак + вордмарк. Знак — «grid»: 2×2 сетка, три ячейки в белой обводке +
// одна лаймовая (утверждён 2026-06-23, design/logo-favicon-preview.html, design-system §7).
// Вордмарк: Inter 900, капсом, «WHY» акцентным лаймом, «GRID» основным цветом. Один
// компонент на все шапки/подвал, чтобы бренд не расходился по страницам. Размер знака
// привязан к кеглю (1em), поэтому масштабируется вместе с текстом при override через className.
function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[0.4em] font-sans text-[1.125rem] font-black uppercase leading-none tracking-tight",
        className
      )}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" className="size-[1em] shrink-0">
        <rect x="14" y="14" width="32" height="32" fill="none" className="stroke-foreground" strokeWidth="7" />
        <rect x="54" y="14" width="32" height="32" className="fill-primary" />
        <rect x="14" y="54" width="32" height="32" fill="none" className="stroke-foreground" strokeWidth="7" />
        <rect x="54" y="54" width="32" height="32" fill="none" className="stroke-foreground" strokeWidth="7" />
      </svg>
      <span>
        <span className="text-primary">Why</span>
        <span className="text-foreground">grid</span>
      </span>
    </span>
  );
}

export { Wordmark };

import { cn } from "@/lib/utils";

// Вордмарк бренда — зафиксирован в design/logo-sketches.html: Inter 900, капсом,
// «WHY» акцентным лаймом, «GRID» основным цветом. Один компонент на все шапки/подвал,
// чтобы бренд не расходился по страницам.
function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-sans text-[1.125rem] font-black uppercase leading-none tracking-tight", className)}>
      <span className="text-primary">Why</span>
      <span className="text-foreground">grid</span>
    </span>
  );
}

export { Wordmark };

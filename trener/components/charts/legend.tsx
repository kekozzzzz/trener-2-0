import { cn } from "@/lib/utils";

// Свотч легенды чартов = мини-клетка сетки с образцом «xx». Слои сетки различаются
// цветом ТЕКСТА в клетке, поэтому пустой квадратик их не передаёт: «граница» и «фолд»
// выглядели чёрным на чёрном (правка Артёма 2026-07-06). className — те же классы,
// что у клетки этого слоя в конкретной панели.
export function LegendSwatch({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-6 shrink-0 items-center justify-center border font-mono text-[0.55rem] leading-none",
        className
      )}
    >
      xx
    </span>
  );
}

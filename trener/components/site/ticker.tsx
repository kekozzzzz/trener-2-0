import { cn } from "@/lib/utils";

// Бегущая лента — design-system.md §5 п. 5 (разрешена 2026-08-09).
// На странице их не больше ДВУХ, и вторая обязана нести смысл, а не украшать пустоту
// (правка Артёма 2026-08-10). Обе идут в разные стороны: одинаково бегущие ленты
// читаются как повтор одного элемента, встречные — как ритм.
//
// Список дублируется дважды: сдвиг на -50% возвращает ленту в исходную точку, шва не видно.
// Лента — не единственный носитель: то же перечисление обязано быть на странице статикой
// (румы — строкой под кнопками hero, вопросы тренера — в секции диалога).
export function Ticker({
  items,
  highlight,
  direction = "left",
  className,
}: {
  items: string[];
  highlight?: string;
  /** Куда бежит лента. Вторая на странице — всегда в противоход первой. */
  direction?: "left" | "right";
  className?: string;
}) {
  const line = highlight ? [...items, highlight] : items;
  const doubled = [...line, ...line];

  return (
    <div className={cn("overflow-hidden border-b border-border bg-[#0B0B0B]", className)}>
      <div
        className={cn(
          "flex w-max gap-12 whitespace-nowrap py-3 font-mono text-label uppercase tracking-[0.14em]",
          direction === "left" ? "ticker-run" : "ticker-run-back"
        )}
      >
        {doubled.map((text, i) => (
          <span
            key={`${text}-${i}`}
            className={text === highlight ? "text-primary" : "text-[#6E6E6E]"}
          >
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}

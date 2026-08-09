// Бегущая лента — design-system.md §5 п. 5 (разрешена 2026-08-08).
// Одна на страницу, цикл 40 секунд, останавливается при prefers-reduced-motion.
//
// Список дублируется дважды: сдвиг на -50% возвращает ленту в исходную точку, шва не видно.
// Лента — украшение: то же самое перечисление обязано быть на странице статикой
// (на главной — строка румов под кнопками hero).
export function Ticker({ items, highlight }: { items: string[]; highlight?: string }) {
  const line = highlight ? [...items, highlight] : items;
  const doubled = [...line, ...line];

  return (
    <div className="overflow-hidden border-b border-border bg-[#0B0B0B]">
      <div className="ticker-run flex w-max gap-12 whitespace-nowrap py-3 font-mono text-label uppercase tracking-[0.14em]">
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

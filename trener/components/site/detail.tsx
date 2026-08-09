import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

// Кирпичи плотности — design-system.md §4.1. Обязательны на всех страницах,
// чтобы разделы сайта выглядели одной системой, а не набором разных вёрсток.
// Все элементы серверные: ни один не требует состояния.

// ── §4.1 п. 3. Угловые засечки ──────────────────────────────────────────────
// Уголок 12×12 акцентом по диагонали блока. Не больше двух-трёх на страницу —
// иначе перестают выделять главное.
export function CornerMarks() {
  return (
    <>
      <span
        aria-hidden
        className="pointer-events-none absolute -left-px -top-px size-3 border-l border-t border-primary"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -bottom-px -right-px size-3 border-b border-r border-primary"
      />
    </>
  );
}

// ── §4.1 п. 2. Заголовок секции ─────────────────────────────────────────────
// Тег `/ 02 — ЦЕННОСТЬ` акцентом, под ним h2, справа по базовой линии — серая
// уточняющая мелочь. Отбивается снизу линией: секции читаются как разделы
// документа, а не как отдельные экраны.
export function SectionHead({
  tag,
  title,
  note,
  className,
}: {
  tag: string;
  title: string;
  note?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-12 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between sm:gap-8",
        className
      )}
    >
      <div>
        <p className="font-mono text-label uppercase tracking-label text-primary">{tag}</p>
        <h2 className="mt-4 text-h1">{title}</h2>
      </div>
      {note && (
        <p className="font-mono text-label uppercase tracking-label text-muted-foreground">{note}</p>
      )}
    </div>
  );
}

// ── §4.1 п. 2. Шапка страницы ───────────────────────────────────────────────
// То же, что SectionHead, но для заголовка страницы: моно-тег раздела над h1.
// Благодаря тегу внутренние страницы читаются как разделы одного документа,
// а не как отдельные сайты (правка Артёма 2026-08-08: «сразу и по остальным страницам»).
export function PageIntro({
  tag,
  title,
  subtitle,
  note,
  className,
}: {
  tag: string;
  title: string;
  subtitle?: string;
  note?: string;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <p className="font-mono text-label uppercase tracking-label text-primary">{tag}</p>
      <h1 className="text-h1">{title}</h1>
      {subtitle && <p className="text-body text-muted-foreground">{subtitle}</p>}
      {note && <p className="text-small text-muted-foreground">{note}</p>}
    </div>
  );
}

// ── §4.1 п. 4. Окно продукта ────────────────────────────────────────────────
// Рамка с моно-строкой пути. Внутрь кладём живой компонент БЕЗ его собственной
// обводки: двойная рамка выглядит так, будто содержимое стоит криво (правка
// Артёма 2026-08-08).
export function ProductWindow({
  path,
  children,
  className,
}: {
  path: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("relative border border-border bg-card", className)}>
      <div className="flex items-center justify-between border-b border-border bg-[#151515] px-4 py-2.5">
        <span className="truncate font-mono text-label text-muted-foreground">{path}</span>
        <span aria-hidden className="flex shrink-0 gap-1.5">
          <i className="block size-2 border border-border" />
          <i className="block size-2 border border-border" />
          <i className="block size-2 border border-border" />
        </span>
      </div>
      <div className="px-4 py-6 sm:px-8">{children}</div>
    </div>
  );
}

// Подпись к рисунку: моно-индекс акцентом + пояснение. Нумерация как в
// техдокументации — часть тона «инженерный инструмент».
export function FigureCaption({ index, children }: { index: string; children: ReactNode }) {
  return (
    <div className="mt-3 flex gap-3">
      <span className="shrink-0 font-mono text-label uppercase tracking-label text-primary">
        {index}
      </span>
      <p className="text-small text-muted-foreground">{children}</p>
    </div>
  );
}

// ── §4.1 п. 5. Ряд крупных чисел ────────────────────────────────────────────
// Только проверяемые значения: из конфига или из кода. Подписи одной высоты,
// поэтому низ колонок стоит на одной линии.
export function StatRow({
  items,
}: {
  items: { value: string; caption: string; accent?: boolean }[];
}) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div
          key={item.caption}
          className="border-t border-border px-8 py-12 first:border-t-0 sm:border-t-0 sm:border-l sm:first:border-l-0 lg:border-l"
        >
          <p
            className={cn(
              "font-mono text-[3.5rem] leading-none tracking-[-0.02em]",
              item.accent ? "text-primary" : "text-foreground"
            )}
          >
            {item.value}
          </p>
          <p className="mt-4 max-w-[22ch] text-small text-muted-foreground sm:min-h-[63px]">
            {item.caption}
          </p>
        </div>
      ))}
    </div>
  );
}

// ── §4.1 п. 6. Бенто-сетка ──────────────────────────────────────────────────
// Шесть колонок, ячейки веса 4+2 и 2+4 — вместо трёх одинаковых карточек в ряд.
export function Bento({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-px border border-border bg-border sm:grid-cols-6">{children}</div>
  );
}

export function BentoCell({
  label,
  title,
  span = 2,
  children,
}: {
  label: string;
  title: string;
  /** Ширина в колонках сетки из шести. */
  span?: 2 | 3 | 4;
  children?: ReactNode;
}) {
  const spanClass = span === 4 ? "sm:col-span-4" : span === 3 ? "sm:col-span-3" : "sm:col-span-2";
  return (
    // flex-колонка: содержимое, прижатое к низу (чипы), выравнивает соседей по
    // общей нижней линии — иначе карточки разной длины выглядят рвано.
    <div className={cn("flex flex-col bg-card p-8", spanClass)}>
      <p className="font-mono text-label uppercase tracking-label text-primary">{label}</p>
      <h3 className="mt-4 text-h3">{title}</h3>
      {children}
    </div>
  );
}

// ── §4.1 п. 8. Чипы ─────────────────────────────────────────────────────────
export function Chips({ items }: { items: { text: string; on?: boolean }[] }) {
  return (
    <div className="mt-auto flex flex-wrap gap-2 pt-6">
      {items.map((chip) => (
        <span
          key={chip.text}
          className={cn(
            "border px-2 py-1 font-mono text-[0.6875rem] uppercase tracking-label",
            chip.on ? "border-primary text-primary" : "border-border text-muted-foreground"
          )}
        >
          {chip.text}
        </span>
      ))}
    </div>
  );
}

// ── §4.1 п. 7. Рельс шагов ──────────────────────────────────────────────────
// Линия ровно по левому краю контента, маркеры по её центру — иначе блок
// визуально съезжает вправо относительно заголовков (правка Артёма 2026-08-08).
export function StepRail({ children }: { children: ReactNode }) {
  return (
    <div className="relative pl-8">
      <span aria-hidden className="absolute bottom-2 left-0 top-2 w-px bg-border" />
      {children}
    </div>
  );
}

export function Step({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="relative py-6 pb-8">
      <span aria-hidden className="absolute -left-9 top-[30px] size-[9px] bg-primary" />
      <p className="font-mono text-label uppercase tracking-label text-primary">{label}</p>
      <h3 className="mt-2 text-h3">{title}</h3>
      <p className="mt-2 max-w-[70ch] text-small text-muted-foreground">{description}</p>
    </div>
  );
}

// ── §4.1 п. 10. Полоса вместо голого процента ───────────────────────────────
// Число всё равно рядом: полоса — иллюстрация, а не единственный носитель.
export function MeterBar({ percent, muted = false }: { percent: number; muted?: boolean }) {
  const width = Math.max(0, Math.min(100, percent));
  return (
    <div className="mt-2 h-1.5 w-full bg-[#242424]">
      <div
        className={cn("h-full", muted ? "bg-[#4A4A4A]" : "bg-primary")}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

// ── §4.1 п. 11. Гигантский вордмарк в подвале ───────────────────────────────
// Строго по центру: без text-indent — он как раз и сбивает центровку.
export function BigWordmark() {
  return (
    <p
      aria-hidden
      className="select-none pt-8 text-center font-heading font-black leading-[0.85] tracking-[-0.04em] text-[#1A1A1A] text-[clamp(4rem,15vw,12.5rem)]"
    >
      <span className="text-primary/20">WHY</span>
      <span className="text-[#242424]">GRID</span>
    </p>
  );
}

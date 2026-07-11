import { Check } from "lucide-react"
import type { ReactNode } from "react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PricingFeatureGroup {
  title: string
  items: string[]
}

interface PricingCardProps {
  title: string
  description: string
  priceLabel: string // уже отформатированная цена, напр. «$9» (числа — в моно, см. дизайн-систему)
  period: string // подпись периода (локализуется вызывающим, напр. «в месяц»)
  volumeNote?: string // строка различия тарифов по объёму, напр. «25 разборов турниров в месяц»
  features?: PricingFeatureGroup[] // если не передан — блок «что входит» не рисуем (он общий, ниже колонок)
  // CTA: либо готовый элемент (кнопка оплаты — клиентский компонент), либо ссылка.
  cta?: ReactNode
  buttonText?: string
  buttonHref?: string
  // Выделенный тариф («Рекомендуем») — лаймовая рамка и бейдж (QA 2026-07-05, п.17).
  featuredLabel?: string
}

export function PricingCard({
  title,
  description,
  priceLabel,
  period,
  volumeNote,
  features,
  cta,
  buttonText,
  buttonHref = "#upload",
  featuredLabel,
}: PricingCardProps) {
  return (
    <div
      className={cn(
        "relative flex h-full flex-col border bg-card",
        featuredLabel ? "border-primary" : "border-border",
      )}
    >
      {featuredLabel && (
        <span className="absolute -top-3 left-8 border border-primary bg-background px-2 py-0.5 font-mono text-label uppercase tracking-label text-primary">
          {featuredLabel}
        </span>
      )}
      {/* Колонка на всю высоту, CTA прижата к низу (mt-auto): при разной высоте текста
          над кнопкой «Оформить» обеих карточек стоят на одной линии. */}
      <div className="flex flex-1 flex-col gap-6 p-8">
        <div className="space-y-1">
          <h3 className="text-h3">{title}</h3>
          <p className="text-small text-muted-foreground">{description}</p>
        </div>
        <div className="space-y-1">
          <div className="flex items-baseline gap-3">
            <span className="whitespace-nowrap font-mono text-h1 text-primary">{priceLabel}</span>
          </div>
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            {period}
          </p>
          {volumeNote && (
            <p className="pt-2 font-mono text-label uppercase tracking-label text-primary">
              {volumeNote}
            </p>
          )}
        </div>
        <div className="mt-auto">
          {cta ?? (
            <a href={buttonHref} className={cn(buttonVariants(), "w-full justify-center")}>
              {buttonText}
            </a>
          )}
        </div>
      </div>

      {features && features.length > 0 && (
        <div className="space-y-6 border-t border-border p-8">
          {features.map((group, groupIndex) => (
            <div key={group.title}>
              <h4 className="mb-4 font-mono text-label uppercase tracking-label text-muted-foreground">
                {group.title}
              </h4>
              <ul className="grid grid-cols-1 gap-3">
                {group.items.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-body">
                    <Check className="size-4 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
              {groupIndex < features.length - 1 && (
                <div className="my-6 border-t border-border" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { Check } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PricingFeatureGroup {
  title: string
  items: string[]
}

interface PricingCardProps {
  title: string
  description: string
  price: number
  period?: string
  originalPrice?: number
  features: PricingFeatureGroup[]
  buttonText?: string
  buttonHref?: string
}

export function PricingCard({
  title,
  description,
  price,
  period = "в месяц",
  originalPrice,
  features,
  buttonText = "Начать",
  buttonHref = "#upload",
}: PricingCardProps) {
  return (
    <div className="border border-border bg-card">
      <div className="space-y-6 p-8">
        <div className="space-y-1">
          <h3 className="text-h3">{title}</h3>
          <p className="text-small text-muted-foreground">{description}</p>
        </div>
        <div className="space-y-1">
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-display text-primary">${price}</span>
            {originalPrice && (
              <span className="font-mono text-h3 text-muted-foreground line-through">
                ${originalPrice}
              </span>
            )}
          </div>
          <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
            {period}
          </p>
        </div>
        <a href={buttonHref} className={cn(buttonVariants(), "w-full justify-center")}>
          {buttonText}
        </a>
      </div>

      <div className="space-y-6 border-t border-border p-8">
        {features.map((group, groupIndex) => (
          <div key={group.title}>
            <h4 className="mb-4 font-mono text-label uppercase tracking-label text-muted-foreground">
              {group.title}
            </h4>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
    </div>
  )
}

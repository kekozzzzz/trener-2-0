import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Кастомная типографическая шкала (design/design-system.md, раздел 2) задана
// через --text-* в app/globals.css. tailwind-merge не знает об этих токенах
// и без этого расширения относит их к группе text-color, из-за чего они
// "конфликтуют" с классами вроде text-muted-foreground и отбрасываются.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": ["text-display", "text-h1", "text-h2", "text-h3", "text-body", "text-small", "text-label"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

import { cn } from "@/lib/utils"

export function LoadingDots({ className }: { className?: string }) {
  return (
    <span className={cn("font-mono", className)} aria-hidden>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="animate-loading-dot inline-block"
          style={{ animationDelay: `${i * 160}ms` }}
        >
          .
        </span>
      ))}
    </span>
  )
}

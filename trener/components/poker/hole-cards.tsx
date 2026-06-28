import { cn } from "@/lib/utils";

const SUIT_GLYPH: Record<string, string> = { c: "♣", d: "♦", h: "♥", s: "♠" };

// Компактный показ карманных карт Hero в строке списка раздач — чтобы игрок узнал
// момент и запомнил руку. Монохром по дизайн-системе (один акцент): масти — глифами,
// без красного/чёрного, прямые углы, 1px-рамка.
export function HoleCards({ cards, className }: { cards: string[]; className?: string }) {
  if (!cards?.length) return null;
  return (
    <span className={cn("inline-flex gap-1", className)}>
      {cards.map((card, i) => {
        const rank = card[0]?.toUpperCase() ?? "?";
        const suit = SUIT_GLYPH[card[1]?.toLowerCase() ?? ""] ?? "";
        return (
          <span
            key={`${card}-${i}`}
            className="inline-flex h-6 items-center justify-center border border-border bg-background px-1 font-mono text-small text-foreground"
          >
            {rank}
            {suit}
          </span>
        );
      })}
    </span>
  );
}

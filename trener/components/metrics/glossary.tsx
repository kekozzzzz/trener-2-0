"use client";

import { CircleHelp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Глоссарий метрик и покерных сокращений, которые игрок видит в интерфейсе и в
// разборах. Объясняем простым языком через смысл и последствие (как и промпты
// коуча: термины не вываливаем без расшифровки). Это справочная копия, не
// бизнес-конфиг — живёт рядом с компонентом.
type Term = { short: string; full: string; desc: string };

const TERMS: Term[] = [
  {
    short: "VPIP",
    full: "Voluntarily Put In Pot",
    desc: "Как часто ты добровольно заходишь в банк до флопа — коллом или рейзом (блайнды не в счёт). Грубо показывает, насколько лузово ты играешь: высокий — много рук, низкий — тайтово.",
  },
  {
    short: "PFR",
    full: "Preflop Raise",
    desc: "Как часто ты входишь в банк именно рейзом до флопа. Разрыв между VPIP и PFR показывает, сколько ты просто коллируешь вместо того, чтобы давить рейзом.",
  },
  {
    short: "RFI",
    full: "Raise First In",
    desc: "Открытие рейзом, когда до тебя в банк ещё никто не вошёл. «Открывашка» — это и есть RFI. У каждой позиции свой нормальный диапазон открытия.",
  },
  {
    short: "SPR",
    full: "Stack-to-Pot Ratio",
    desc: "Отношение эффективного стека к размеру банка на флопе. Маленький SPR — банк уже большой относительно стеков, проще ставить всё; большой — есть простор для манёвра.",
  },
  {
    short: "BB",
    full: "большой блайнд",
    desc: "В больших блайндах меряют стек и результат раздачи: «15 BB» понятнее, чем «383 304 фишки», потому что не зависит от уровня блайндов.",
  },
  {
    short: "AF",
    full: "фактор агрессии",
    desc: "Сколько у тебя агрессивных действий после флопа (ставка, рейз) на одно пассивное (колл). Выше — агрессивнее ведёшь раздачу.",
  },
  {
    short: "Пот-оддсы",
    full: "шансы банка",
    desc: "Сколько нужно доставить относительно того, что уже лежит в банке. Сравниваешь со своими шансами улучшить руку, чтобы понять, выгоден ли колл.",
  },
];

export function MetricsGlossary() {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Что значат метрики и сокращения"
          />
        }
      >
        <CircleHelp className="text-muted-foreground" />
      </DialogTrigger>
      <DialogContent className="rounded-none sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-label uppercase tracking-label text-muted-foreground">
            Что значат сокращения
          </DialogTitle>
          <DialogDescription className="sr-only">
            Расшифровка метрик и покерных сокращений
          </DialogDescription>
        </DialogHeader>
        <dl className="-mr-2 max-h-[70vh] space-y-6 overflow-y-auto pr-2">
          {TERMS.map((t) => (
            <div key={t.short}>
              <dt className="flex items-baseline gap-2">
                <span className="font-mono text-body text-primary">{t.short}</span>
                <span className="text-small text-muted-foreground">{t.full}</span>
              </dt>
              <dd className="mt-1 text-small text-foreground">{t.desc}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

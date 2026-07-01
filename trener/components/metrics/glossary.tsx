"use client";

import { CircleHelp } from "lucide-react";
import { useTranslations } from "next-intl";
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

export function MetricsGlossary() {
  const t = useTranslations("Glossary");
  // Список терминов: короткое обозначение фиксировано (VPIP и т.д.), расшифровка и
  // описание — из словаря по языку интерфейса.
  const TERMS: Term[] = [
    { short: "VPIP", full: t("vpipFull"), desc: t("vpipDesc") },
    { short: "PFR", full: t("pfrFull"), desc: t("pfrDesc") },
    { short: "RFI", full: t("rfiFull"), desc: t("rfiDesc") },
    { short: "SPR", full: t("sprFull"), desc: t("sprDesc") },
    { short: "BB", full: t("bbFull"), desc: t("bbDesc") },
    { short: "AF", full: t("afFull"), desc: t("afDesc") },
    { short: t("potOddsShort"), full: t("potOddsFull"), desc: t("potOddsDesc") },
  ];

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("helpLabel")}
          />
        }
      >
        <CircleHelp className="text-muted-foreground" />
      </DialogTrigger>
      <DialogContent className="rounded-none sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-mono text-label uppercase tracking-label text-muted-foreground">
            {t("title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t("srDescription")}
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

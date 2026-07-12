"use client";

import { useState, useTransition, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SELF_LEVELS, type SelfLevel } from "@/config/self-level";
import { setSelfLevelAction } from "./actions";

// «Ориентир» — тихая строчка на странице турнира: игрок одним тапом отмечает, насколько
// глубоко понимает покер, чтобы тренер выбрал глубину объяснений на первые турниры.
// Строчка показывается только пока ориентир активен (решает сервер по окну «10 турниров
// ИЛИ 1500 рук», см. isSelfLevelActive) — здесь только UI. План 2026-07-10.
export function SelfLevelLine({
  level,
  tournamentId,
}: {
  level: SelfLevel | null;
  tournamentId: string;
}) {
  const t = useTranslations("SelfLevel");
  const [open, setOpen] = useState(false);
  // Оптимистичная копия: строчка обновляется мгновенно, сервер догонит revalidatePath.
  const [current, setCurrent] = useState<SelfLevel | null>(level);
  const [, startTransition] = useTransition();

  // Первый заход, пока уровень не задан: авто-открыть диалог ОДИН раз. Тихую строчку
  // реальный тестер (12.07) не заметил и ждал, думая, что идёт расчёт. Флаг «уже показывали»
  // — в localStorage (без миграции БД). Разбор идёт ЗА диалогом, диалог его не блокирует;
  // «пропустить»/крестик/клик по фону закрывают, строчка остаётся точкой повторного входа.
  const SEEN_KEY = "wg_selflevel_seen";
  function markSeen() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* приватный режим / localStorage недоступен — не критично */
    }
  }
  useEffect(() => {
    if (level !== null) return; // уровень уже выбирался — не навязываемся
    try {
      if (localStorage.getItem(SEEN_KEY) === "1") return; // уже показывали в этом браузере
    } catch {
      return; // нет доступа к localStorage — не рискуем навязчивым авто-показом
    }
    setOpen(true);
  }, [level]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) markSeen();
  }

  const shortLabel: Record<SelfLevel, string> = {
    NEW: t("newLabel"),
    BASICS: t("basicsLabel"),
    CONFIDENT: t("confidentLabel"),
    DEEP: t("deepLabel"),
  };
  const desc: Record<SelfLevel, string> = {
    NEW: t("newDesc"),
    BASICS: t("basicsDesc"),
    CONFIDENT: t("confidentDesc"),
    DEEP: t("deepDesc"),
  };

  function choose(value: SelfLevel | "") {
    markSeen();
    setCurrent(value === "" ? null : value);
    setOpen(false);
    startTransition(() => {
      void setSelfLevelAction(value, tournamentId);
    });
  }

  const triggerText = current
    ? `${t("trigger")}: ${shortLabel[current]}`
    : t("trigger");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger className="mt-3 inline-flex items-center gap-1 font-mono text-label uppercase tracking-label text-muted-foreground transition-colors hover:text-foreground">
        {triggerText}
        <ChevronDown className="size-3" />
      </DialogTrigger>

      <DialogContent className="rounded-none sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-heading text-h3 text-foreground">
            {t("title")}
          </DialogTitle>
          <DialogDescription className="text-small text-muted-foreground">
            {t("intro")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          {SELF_LEVELS.map((code) => {
            const active = current === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => choose(code)}
                className={`border p-3 text-left transition-colors ${
                  active
                    ? "border-primary bg-card"
                    : "border-border bg-card hover:border-primary"
                }`}
              >
                <span className="block text-body text-foreground">{shortLabel[code]}</span>
                <span className="mt-1 block text-small text-muted-foreground">{desc[code]}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => choose("")}
          className="font-mono text-label uppercase tracking-label text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("skip")}
        </button>
      </DialogContent>
    </Dialog>
  );
}

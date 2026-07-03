import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { bigBlindFromSnapshot } from "@/parser/big-blind";
import { heroDecisionLabel } from "@/parser/hand-summary";
import type { TableSnapshot } from "@/parser/types";
import { HoleCards } from "@/components/poker/hole-cards";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Верхний слот страницы турнира (план 2026-07-03-верхний-слот-турнира): вместо
// «списка из 14 дел» игрок сразу получает точку входа или финиш. Два состояния:
//  - StartHereCard: самая дорогая непройденная раздача карточки — «начни отсюда»;
//  - SessionDoneCard: все сократовские диалоги дошли до вердикта — «сессия разобрана».
// Кто кандидат и какое состояние — решает страница из уже посчитанных парсером данных
// (Правило 1: числа считает парсер; здесь только показ).

export type FocusHand = {
  id: string;
  chipResult: number;
  tableData: unknown;
};

export async function StartHereCard({
  tournamentId,
  hand,
}: {
  tournamentId: string;
  hand: FocusHand;
}) {
  const t = await getTranslations("FocusSlot");
  const snap = hand.tableData as TableSnapshot;
  const label = heroDecisionLabel(snap);
  const bb = bigBlindFromSnapshot(snap);
  const bbResult = bb ? hand.chipResult / bb : null;
  const sign = hand.chipResult >= 0 ? "+" : "";

  return (
    <div className="mt-12 border border-primary bg-card p-6">
      <p className="font-mono text-label uppercase tracking-label text-primary">
        {t("startHereTitle")}
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-6">
        <div className="flex min-w-0 items-center gap-4">
          <HoleCards cards={snap.heroCards ?? []} />
          <div className="flex min-w-0 flex-col gap-1">
            <span className="font-mono text-h2 text-foreground">
              {bbResult !== null
                ? `${sign}${bbResult.toFixed(1)} BB`
                : `${sign}${hand.chipResult} ${t("chips")}`}
            </span>
            {label && (
              <span className="truncate text-small text-muted-foreground">{label}</span>
            )}
          </div>
        </div>
        <Link
          href={`/tournament/${tournamentId}/hands/${hand.id}`}
          className={cn(buttonVariants(), "shrink-0")}
        >
          {t("openReview")}
          <ArrowRight className="size-4" />
        </Link>
      </div>
      <p className="mt-4 text-small text-muted-foreground">
        {hand.chipResult < 0 ? t("noteLoss") : t("noteSwing")}
      </p>
    </div>
  );
}

export async function SessionDoneCard({ count }: { count: number }) {
  const t = await getTranslations("FocusSlot");

  return (
    <div className="mt-12 border border-primary bg-card p-6">
      <p className="font-mono text-label uppercase tracking-label text-primary">
        {t("sessionDoneTitle")}
      </p>
      <p className="mt-2 text-h3 text-foreground">{t("sessionDoneBody", { count })}</p>
      <p className="mt-2 text-small text-muted-foreground">{t("sessionDoneNote")}</p>
    </div>
  );
}

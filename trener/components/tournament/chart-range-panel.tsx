"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import { pushCellState } from "@/config/poker/push-fold-chart";
import { restealCellState } from "@/config/poker/resteal-chart";
import { rfiCellState } from "@/config/poker/rfi-chart";
import { vsOpenCellState } from "@/config/poker/vs-open-chart";
import { bbCellState } from "@/config/poker/bb-defense-chart";
import { bvbCellState } from "@/config/poker/bvb-chart";
import { isoCellState } from "@/config/poker/iso-chart";
import { callVsPushCellState } from "@/config/poker/call-vs-push-chart";
import { callVsRestealCellState } from "@/config/poker/call-vs-resteal-chart";
import { fourBetCellState } from "@/config/poker/def-vs-3bet-chart";
import type { ChartRangeSpot } from "@/parser/chart-range-spot";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SIZE = GRID_RANKS.length; // 13

// Унифицированный тон клетки поверх РАЗНЫХ грейдеров: основное действие спота / весовая клетка /
// альтернативное действие того же чарта (в защите BB это 3-бет рядом с коллом) / граница / вне.
type Tone = "PRIMARY" | "WEIGHT" | "ALT" | "BORDER" | "OUT";

function toneFor(spot: ChartRangeSpot, code: string): Tone {
  switch (spot.kind) {
    case "bbdefense": {
      const s = bbCellState(spot.opener, code);
      if (s === "CALL") return "PRIMARY";
      if (s === "CALL_SOMETIMES") return "WEIGHT";
      return s === "THREEBET" || s === "THREEBET_BLUFF" ? "ALT" : "OUT";
    }
    case "bvb": {
      const s = bvbCellState(code);
      if (s === "CALL") return "PRIMARY";
      if (s === "CALL_SOMETIMES") return "WEIGHT";
      return s === "THREEBET" || s === "THREEBET_BLUFF" ? "ALT" : "OUT";
    }
    case "resteal": {
      const s = restealCellState(spot.openerGroup, spot.band, code);
      return s === "JAM" ? "PRIMARY" : s === "JAM_WEIGHT" ? "WEIGHT" : s === "BORDER" ? "BORDER" : "OUT";
    }
    case "callvspush": {
      const s = callVsPushCellState(spot.pusherGroup, spot.pusherBand, code);
      return s === "CALL" ? "PRIMARY" : s === "BORDER" ? "BORDER" : "OUT";
    }
    case "vsopen": {
      const s = vsOpenCellState(spot.heroPosition, code);
      return s === "THREEBET" ? "PRIMARY" : s === "THREEBET_BLUFF" ? "WEIGHT" : s === "BORDER" ? "BORDER" : "OUT";
    }
    case "callvsresteal": {
      const s = callVsRestealCellState(spot.openerGroup, spot.jamBand, code);
      return s === "CALL" ? "PRIMARY" : s === "BORDER" ? "BORDER" : "OUT";
    }
    case "defvs3bet": {
      const s = fourBetCellState(spot.heroPosition, code);
      return s === "FOURBET" ? "PRIMARY" : s === "BLUFF" ? "WEIGHT" : s === "BORDER" ? "BORDER" : "OUT";
    }
    case "rfi": {
      const s = rfiCellState(spot.position, code);
      return s === "ALWAYS" ? "PRIMARY" : s === "SOMETIMES" ? "WEIGHT" : s === "BORDER" ? "BORDER" : "OUT";
    }
    case "iso": {
      const s = isoCellState(spot.heroPosition, code);
      return s === "ISO" ? "PRIMARY" : s === "OVERLIMP" ? "ALT" : s === "BORDER" ? "BORDER" : "OUT";
    }
    case "openshove": {
      const s = pushCellState(spot.band, spot.position, code);
      return s === "ALWAYS" ? "PRIMARY" : s === "BORDER" ? "BORDER" : "OUT";
    }
  }
}

// Какое ДЕЙСТВИЕ означает тон в этом споте — чтобы легенда говорила «коллить»/«открывать рейзом»,
// а не абстрактное «в диапазоне». Ключи ведут в messages (ChartRange.action*).
const ACTIONS: Record<ChartRangeSpot["kind"], { primary: string; weight?: string; alt?: string }> = {
  bbdefense: { primary: "Call", weight: "CallSometimes", alt: "Threebet" },
  bvb: { primary: "Call", weight: "CallSometimes", alt: "Threebet" },
  resteal: { primary: "Jam", weight: "JamWeight" },
  callvspush: { primary: "Call" },
  vsopen: { primary: "Threebet", weight: "ThreebetBluff" },
  callvsresteal: { primary: "Call" },
  defvs3bet: { primary: "Fourbet", weight: "FourbetBluff" },
  rfi: { primary: "Open", weight: "OpenSometimes" },
  iso: { primary: "Iso", alt: "Overlimp" },
  openshove: { primary: "Push" },
};

const TONE_CLASS: Record<Exclude<Tone, "OUT">, string> = {
  PRIMARY: "border-primary bg-primary text-primary-foreground",
  WEIGHT: "border-primary/60 bg-primary/30 text-foreground",
  ALT: "border-primary bg-primary/10 text-foreground",
  BORDER: "border-border bg-card text-foreground",
};

// Панель «эталонный диапазон для этого спота» под вердиктом (Артём 18.07: «везде, где чарты
// используются, их засунуть» — на вердикт «в следующий раз фолд» сразу видно, а с чем тогда играть).
// По кнопке (не простыня) и ПОСЛЕ разбора — не подсказывает ответ заранее. Раскраска из тех же
// чартов, что у детекторов, вердикта префлоп-чарта и публичной /charts — разойтись не могут.
export function ChartRangePanel({ spot }: { spot: ChartRangeSpot }) {
  const t = useTranslations("ChartRange");
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="mt-6">
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
          {t("button")}
        </Button>
      </div>
    );
  }

  const opener = (g: "EARLY" | "LATE") => t(g === "EARLY" ? "openerEarly" : "openerLate");
  const pushBand = (b: "SHORT" | "MID") => t(b === "SHORT" ? "bandShort" : "bandMid");
  const jamBand = (b: "LOW" | "HIGH") => t(b === "LOW" ? "bandLow" : "bandHigh");
  const pos = (p: string) => (p === "MP2" ? "MP" : p);

  const spotLabel = (() => {
    switch (spot.kind) {
      case "bbdefense":
        return t("spotBbdefense", { opener: spot.opener });
      case "bvb":
        return t("spotBvb");
      case "resteal":
        return t("spotResteal", { opener: opener(spot.openerGroup), band: jamBand(spot.band) });
      case "callvspush":
        return t("spotCallvspush", { opener: opener(spot.pusherGroup), band: pushBand(spot.pusherBand) });
      case "vsopen":
        return t("spotVsopen", { pos: pos(spot.heroPosition) });
      case "callvsresteal":
        return t("spotCallvsresteal", { opener: opener(spot.openerGroup), band: jamBand(spot.jamBand) });
      case "defvs3bet":
        return t("spotDefvs3bet", { pos: pos(spot.heroPosition) });
      case "rfi":
        return t("spotRfi", { pos: pos(spot.position) });
      case "iso":
        return t("spotIso", { pos: pos(spot.heroPosition) });
      case "openshove":
        return t("spotOpenshove", { pos: pos(spot.position), band: pushBand(spot.band) });
    }
  })();

  const actions = ACTIONS[spot.kind];
  // В легенду попадают только те тона, что реально есть в этой сетке.
  const present = new Set<Tone>();
  for (let row = 0; row < SIZE; row++)
    for (let col = 0; col < SIZE; col++) present.add(toneFor(spot, cellCode(row, col)));

  const legend: { tone: Exclude<Tone, "OUT">; label: string }[] = [];
  if (present.has("PRIMARY")) legend.push({ tone: "PRIMARY", label: t(`action${actions.primary}`) });
  if (actions.weight && present.has("WEIGHT"))
    legend.push({ tone: "WEIGHT", label: t(`action${actions.weight}`) });
  if (actions.alt && present.has("ALT")) legend.push({ tone: "ALT", label: t(`action${actions.alt}`) });
  if (present.has("BORDER")) legend.push({ tone: "BORDER", label: t("legendBorder") });

  return (
    <div className="mt-6 border border-border bg-card p-4">
      <p className="font-mono text-label uppercase tracking-label text-muted-foreground">{t("title")}</p>
      <p className="mt-1 text-small text-foreground">{spotLabel}</p>

      <div
        className="mt-4 grid w-full max-w-[420px] select-none gap-px"
        style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: SIZE }).map((_, row) =>
          Array.from({ length: SIZE }).map((__, col) => {
            const code = cellCode(row, col);
            const tone = toneFor(spot, code);
            const isHero = code === spot.heroCode;
            return (
              <div
                key={code}
                title={isHero ? `${code}: ${t("yourHand")}` : code}
                className={cn(
                  "relative flex aspect-square items-center justify-center border font-mono leading-none",
                  tone === "OUT" ? "border-border bg-card text-muted-foreground/30" : TONE_CLASS[tone],
                  // Твоя рука — жирная рамка поверх любой заливки, чтобы найти её взглядом.
                  isHero && "z-10 ring-2 ring-inset ring-foreground",
                )}
              >
                <span className="text-[0.5rem] sm:text-[0.65rem]">{code}</span>
              </div>
            );
          }),
        )}
      </div>

      <div className="mt-4 flex flex-col gap-1.5 text-small text-muted-foreground">
        {legend.map(({ tone, label }) => (
          <span key={tone} className="flex items-center gap-2">
            <span className={cn("inline-block size-3 border", TONE_CLASS[tone])} />
            {label}
          </span>
        ))}
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 border-2 border-foreground bg-card" />
          {t("yourHand")}
        </span>
      </div>

      <p className="mt-4 max-w-2xl text-small text-muted-foreground">{t("note")}</p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { GRID_RANKS, cellCode } from "@/config/poker/hand-grid";
import { restealCellState, type RestealBand, type RestealOpenerGroup } from "@/config/poker/resteal-chart";
import { callVsPushCellState, type PusherGroup } from "@/config/poker/call-vs-push-chart";
import { callVsRestealCellState } from "@/config/poker/call-vs-resteal-chart";
import { bvbCellState } from "@/config/poker/bvb-chart";
import { fourBetCellState } from "@/config/poker/def-vs-3bet-chart";
import { isSqueezeSignificantlyWide } from "@/config/poker/squeeze-chart";
import type { OpenPosition } from "@/config/poker/rfi-chart";
import type { StackBand } from "@/config/poker/push-fold-chart";
import { cn } from "@/lib/utils";
import { LegendSwatch } from "@/components/charts/legend";

// Панели «доборных» эталонов (QA 2026-07-05, пункт 7): тренер судит этими чартами
// (parser/preflop-chart-fact) — значит, игрок должен мочь их посмотреть. Раскраска
// из тех же cellState-функций, что и вердикты, — страница и тренер не расходятся.

const SIZE = GRID_RANKS.length; // 13

// Общая сетка 13×13: className для клетки решает вызывающий по коду руки.
function Grid13({ cellClass, cellTitle }: { cellClass: (code: string) => string; cellTitle?: (code: string) => string }) {
  return (
    <div
      className="mt-6 grid w-full max-w-[420px] select-none gap-px"
      style={{ gridTemplateColumns: `repeat(${SIZE}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: SIZE }).map((_, row) =>
        Array.from({ length: SIZE }).map((__, col) => {
          const code = cellCode(row, col);
          return (
            <div
              key={code}
              title={cellTitle?.(code)}
              className={cn(
                "flex aspect-square items-center justify-center border font-mono leading-none",
                cellClass(code)
              )}
            >
              <span className="text-[0.5rem] sm:text-[0.65rem]">{code}</span>
            </div>
          );
        })
      )}
    </div>
  );
}

function Toggle<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  labels?: Partial<Record<T, string>>;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {options.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          aria-pressed={value === p}
          className={cn(
            "border px-3 py-2 font-mono text-label uppercase tracking-label transition-colors duration-150 ease-out",
            value === p ? "border-primary text-primary" : "border-border text-muted-foreground hover:border-primary"
          )}
        >
          {labels?.[p] ?? p}
        </button>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { swatch: string; label: string }[] }) {
  return (
    <div className="mt-6 flex flex-col gap-2 text-small text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="flex items-center gap-2">
          <LegendSwatch className={it.swatch} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// ── Рестил: 3-бет-олл-ин 10–20bb против одиночного опена ────────────────────────
export function RestealPanel() {
  const t = useTranslations("ReferenceCharts");
  const [group, setGroup] = useState<RestealOpenerGroup>("LATE");
  const [band, setBand] = useState<RestealBand>("HIGH");

  return (
    <>
      <p className="max-w-2xl text-small text-muted-foreground">{t("restealOpenerLabel")}</p>
      <Toggle
        options={["EARLY", "LATE"] as RestealOpenerGroup[]}
        value={group}
        onChange={setGroup}
        labels={{ EARLY: t("groupEarly"), LATE: t("groupLate") }}
      />
      <p className="mt-4 max-w-2xl text-small text-muted-foreground">{t("restealBandLabel")}</p>
      <Toggle
        options={["LOW", "HIGH"] as RestealBand[]}
        value={band}
        onChange={setBand}
        labels={{ LOW: "10-14 BB", HIGH: "14-25 BB" }}
      />
      <Grid13
        cellClass={(code) => {
          const s = restealCellState(group, band, code);
          return cn(
            s === "JAM" && "border-primary bg-primary text-primary-foreground",
            s === "JAM_WEIGHT" && "border-primary bg-card text-primary",
            s === "BORDER" && "border-border bg-card text-muted-foreground",
            s === "OUT" && "border-border bg-card text-muted-foreground/30"
          );
        }}
      />
      <Legend
        items={[
          { swatch: "border-primary bg-primary text-primary-foreground", label: t("restealLegendJam") },
          { swatch: "border-primary bg-card text-primary", label: t("restealLegendWeight") },
          { swatch: "border-border bg-card text-muted-foreground", label: t("legendBorder") },
          { swatch: "border-border bg-card text-muted-foreground/30", label: t("legendFold") },
        ]}
      />
    </>
  );
}

// ── Колл против опен-олл-ина короткого (≤14bb) ─────────────────────────────────
export function CallVsPushPanel() {
  const t = useTranslations("ReferenceCharts");
  const [group, setGroup] = useState<PusherGroup>("LATE");
  const [band, setBand] = useState<StackBand>("MID");

  return (
    <>
      <p className="max-w-2xl text-small text-muted-foreground">{t("cvpPusherLabel")}</p>
      <Toggle
        options={["EARLY", "LATE"] as PusherGroup[]}
        value={group}
        onChange={setGroup}
        labels={{ EARLY: t("groupEarly"), LATE: t("groupLate") }}
      />
      <p className="mt-4 max-w-2xl text-small text-muted-foreground">{t("cvpBandLabel")}</p>
      <Toggle
        options={["SHORT", "MID"] as StackBand[]}
        value={band}
        onChange={setBand}
        labels={{ SHORT: t("bandShort"), MID: "10-14 BB" }}
      />
      <Grid13
        cellClass={(code) => {
          const s = callVsPushCellState(group, band, code);
          return cn(
            s === "CALL" && "border-primary bg-primary text-primary-foreground",
            s === "BORDER" && "border-border bg-card text-muted-foreground",
            s === "OUT" && "border-border bg-card text-muted-foreground/30"
          );
        }}
      />
      <Legend
        items={[
          { swatch: "border-primary bg-primary text-primary-foreground", label: t("cvpLegendCall") },
          { swatch: "border-border bg-card text-muted-foreground", label: t("legendBorder") },
          { swatch: "border-border bg-card text-muted-foreground/30", label: t("legendFold") },
        ]}
      />
    </>
  );
}

// ── Колл против рестила (нас реджемят после нашего опена) ──────────────────────
export function CallVsRestealPanel() {
  const t = useTranslations("ReferenceCharts");
  const [group, setGroup] = useState<RestealOpenerGroup>("LATE");
  const [band, setBand] = useState<RestealBand>("HIGH");

  return (
    <>
      <p className="max-w-2xl text-small text-muted-foreground">{t("cvrOpenerLabel")}</p>
      <Toggle
        options={["EARLY", "LATE"] as RestealOpenerGroup[]}
        value={group}
        onChange={setGroup}
        labels={{ EARLY: t("groupEarlyOur"), LATE: t("groupLateOur") }}
      />
      <p className="mt-4 max-w-2xl text-small text-muted-foreground">{t("cvrBandLabel")}</p>
      <Toggle
        options={["LOW", "HIGH"] as RestealBand[]}
        value={band}
        onChange={setBand}
        labels={{ LOW: "10-14 BB", HIGH: "14-25 BB" }}
      />
      <Grid13
        cellClass={(code) => {
          const s = callVsRestealCellState(group, band, code);
          return cn(
            s === "CALL" && "border-primary bg-primary text-primary-foreground",
            s === "BORDER" && "border-border bg-card text-muted-foreground",
            s === "OUT" && "border-border bg-card text-muted-foreground/30"
          );
        }}
      />
      <Legend
        items={[
          { swatch: "border-primary bg-primary text-primary-foreground", label: t("cvrLegendCall") },
          { swatch: "border-border bg-card text-muted-foreground", label: t("legendBorder") },
          { swatch: "border-border bg-card text-muted-foreground/30", label: t("cvrLegendFold") },
        ]}
      />
    </>
  );
}

// ── Блайнд-против-блайнда: защита BB против опен-рейза SB ──────────────────────
export function BvbPanel() {
  const t = useTranslations("ReferenceCharts");
  return (
    <>
      <Grid13
        cellClass={(code) => {
          const s = bvbCellState(code);
          return cn(
            s === "THREEBET" && "border-primary bg-primary text-primary-foreground",
            s === "THREEBET_BLUFF" && "border-primary bg-card text-primary",
            s === "CALL" && "border-border bg-card text-foreground",
            s === "CALL_SOMETIMES" && "border-border bg-card text-muted-foreground",
            s === "FOLD" && "border-border bg-card text-muted-foreground/30"
          );
        }}
      />
      <Legend
        items={[
          { swatch: "border-primary bg-primary text-primary-foreground", label: t("bbLegendThreebet") },
          { swatch: "border-primary bg-card text-primary", label: t("bbLegendThreebetBluff") },
          { swatch: "border-border bg-card text-foreground", label: t("bbLegendCall") },
          { swatch: "border-border bg-card text-muted-foreground", label: t("bbLegendCallSometimes") },
          { swatch: "border-border bg-card text-muted-foreground/30", label: t("legendFold") },
        ]}
      />
    </>
  );
}

// ── 4-бет против 3-бета (мы открылись, в нас 3-бетнули) ────────────────────────
const FOURBET_POSITIONS: OpenPosition[] = ["UTG", "MP", "HJ", "CO", "BTN", "SB"];

export function FourBetPanel() {
  const t = useTranslations("ReferenceCharts");
  const [pos, setPos] = useState<OpenPosition>("CO");
  return (
    <>
      <p className="max-w-2xl text-small text-muted-foreground">{t("fourbetPosLabel")}</p>
      <Toggle options={FOURBET_POSITIONS} value={pos} onChange={setPos} />
      <Grid13
        cellClass={(code) => {
          const s = fourBetCellState(pos, code);
          return cn(
            s === "FOURBET" && "border-primary bg-primary text-primary-foreground",
            s === "BLUFF" && "border-primary bg-card text-primary",
            s === "BORDER" && "border-border bg-card text-muted-foreground",
            s === "OUT" && "border-border bg-card text-muted-foreground/30"
          );
        }}
      />
      <Legend
        items={[
          { swatch: "border-primary bg-primary text-primary-foreground", label: t("fourbetLegendValue") },
          { swatch: "border-primary bg-card text-primary", label: t("fourbetLegendBluff") },
          { swatch: "border-border bg-card text-muted-foreground", label: t("legendBorder") },
          { swatch: "border-border bg-card text-muted-foreground/30", label: t("fourbetLegendOut") },
        ]}
      />
    </>
  );
}

// ── Сквиз: лояльная граница «сквизуемо хоть откуда-нибудь» ─────────────────────
export function SqueezePanel() {
  const t = useTranslations("ReferenceCharts");
  return (
    <>
      <Grid13
        cellClass={(code) =>
          isSqueezeSignificantlyWide("CO", code)
            ? "border-border bg-card text-muted-foreground/30"
            : "border-primary bg-card text-primary"
        }
      />
      <Legend
        items={[
          { swatch: "border-primary bg-card text-primary", label: t("squeezeLegendOk") },
          { swatch: "border-border bg-card text-muted-foreground/30", label: t("squeezeLegendOut") },
        ]}
      />
    </>
  );
}

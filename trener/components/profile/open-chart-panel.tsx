"use client";

import { useState } from "react";
import type { OpenPosition } from "@/config/poker/rfi-chart";
import type { OpenChartFacts } from "@/features/profile/open-chart";
import { CHARACTERISTIC_RELIABLE_FROM } from "@/config/profile";
import { OpenChartGrid } from "./open-chart-grid";
import { cn } from "@/lib/utils";

const POSITIONS: { key: OpenPosition; label: string }[] = [
  { key: "UTG", label: "UTG" },
  { key: "MP", label: "MP" },
  { key: "HJ", label: "HJ" },
  { key: "CO", label: "CO" },
  { key: "BTN", label: "BTN" },
  { key: "SB", label: "SB" },
];

// Презентационная панель чарта открываний (без загрузки) — переключатель позиций,
// сетка, легенда, оговорка надёжности. Используется и боевой кнопкой «Твои чарты»
// (после ленивой загрузки), и страницей /design-preview (на демо-данных).
export function OpenChartPanel({
  chart,
  tournamentsCounted,
}: {
  chart: OpenChartFacts;
  tournamentsCounted: number;
}) {
  const [pos, setPos] = useState<OpenPosition>("BTN");
  const reliable = tournamentsCounted >= CHARACTERISTIC_RELIABLE_FROM;

  return (
    <>
      <h3 className="text-h3">Как ты открываешься</h3>
      <p className="mt-2 max-w-2xl text-small text-muted-foreground">
        Примерная картина по всей твоей дистанции — какие руки и откуда ты открываешь
        первым. Это зеркало, а не эталон: лаймом горят руки, которые ты открываешь широко.
      </p>

      {/* Переключатель позиций */}
      <div className="mt-6 flex flex-wrap gap-2">
        {POSITIONS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPos(p.key)}
            aria-pressed={pos === p.key}
            className={cn(
              "border px-3 py-2 font-mono text-label uppercase tracking-label transition-colors duration-150 ease-out",
              pos === p.key
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:border-primary"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="mt-6">
        <OpenChartGrid cells={chart[pos]} />
      </div>

      {/* Легенда */}
      <div className="mt-6 flex flex-col gap-2 text-small text-muted-foreground">
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 border border-primary bg-primary" />
          Широкий опен — стоит присмотреться
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 border border-primary bg-card" />
          Широкий опен, но пока редко — возможно, мисклик
        </span>
        <span className="flex items-center gap-2">
          <span className="inline-block size-3 border border-border bg-card" />
          Обычный опен
        </span>
      </div>

      <p className="mt-6 text-small text-muted-foreground">
        {reliable
          ? `Собрано по всей твоей дистанции (учтено турниров: ${tournamentsCounted}).`
          : `Пока учтено турниров: ${tournamentsCounted}. Картина предварительная — станет точнее примерно от ${CHARACTERISTIC_RELIABLE_FROM} турниров.`}
      </p>
    </>
  );
}

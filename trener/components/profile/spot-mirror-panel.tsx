"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { OpenChartCell } from "@/features/profile/open-chart";
import { CHARACTERISTIC_RELIABLE_FROM } from "@/config/profile";
import { OpenChartGrid } from "./open-chart-grid";
import { cn } from "@/lib/utils";
import { LegendSwatch } from "@/components/charts/legend";

// Слой зеркала: одно действие в споте («колл», «3-бет», «пуш до 10 BB»…). judged —
// решает раскраску: true → лаймом «шире нормы» (флаг wide из агрегатора), false →
// действие не судим, серым со счётчиком (как SB-лимпы). noun — слово в подсказке клетки.
export type MirrorLayer = {
  key: string;
  label: string;
  judged: boolean;
  noun: string;
  cells: OpenChartCell[];
};

export type MirrorPosition = { key: string; label: string; layers: MirrorLayer[] };

// Общая панель зеркала спота («Твои чарты», план 2026-07-03-твои-чарты-все-споты):
// переключатель позиций + переключатель слоёв (если их больше одного) + сетка 13×13 +
// легенда + оговорка надёжности. Раскладка и стили — как у панели открываний.
export function SpotMirrorPanel({
  title,
  intro,
  positions,
  defaultPosition,
  tournamentsCounted,
}: {
  title: string;
  intro: string;
  positions: MirrorPosition[];
  defaultPosition?: string;
  tournamentsCounted: number;
}) {
  const t = useTranslations("PlayerCharts");
  const [posKey, setPosKey] = useState(defaultPosition ?? positions[0].key);
  const pos = positions.find((p) => p.key === posKey) ?? positions[0];
  // Ключи слоёв одинаковы на всех позициях — выбранный слой переживает смену позиции.
  const [layerKey, setLayerKey] = useState(pos.layers[0].key);
  const layer = pos.layers.find((l) => l.key === layerKey) ?? pos.layers[0];

  return (
    <>
      <h3 className="text-h3">{title}</h3>
      <p className="mt-2 max-w-2xl text-small text-muted-foreground">{intro}</p>

      {/* Переключатель позиций */}
      <div className="mt-6 flex flex-wrap gap-2">
        {positions.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPosKey(p.key)}
            aria-pressed={pos.key === p.key}
            className={cn(
              "border px-3 py-2 font-mono text-label uppercase tracking-label transition-colors duration-150 ease-out",
              pos.key === p.key
                ? "border-primary text-primary"
                : "border-border text-muted-foreground hover:border-primary"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Переключатель слоёв (колл/3-бет, стек-бэнды) — только если слоёв больше одного */}
      {pos.layers.length > 1 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pos.layers.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setLayerKey(l.key)}
              aria-pressed={layer.key === l.key}
              className={cn(
                "border px-3 py-1.5 font-mono text-label uppercase tracking-label transition-colors duration-150 ease-out",
                layer.key === l.key
                  ? "border-primary text-primary"
                  : "border-border text-muted-foreground hover:border-primary"
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-6">
        <OpenChartGrid
          cells={layer.cells}
          variant={layer.judged ? "raise" : "limp"}
          noun={layer.noun}
        />
      </div>

      {/* Легенда: судимый слой — лаймовая шкала «шире нормы», несудимый — играна/нет */}
      <div className="mt-6 flex flex-col gap-2 text-small text-muted-foreground">
        {layer.judged ? (
          <>
            <span className="flex items-center gap-2">
              <LegendSwatch className="border-primary bg-primary text-primary-foreground" />
              {t("legendJudgedWide", { noun: layer.noun })}
            </span>
            <span className="flex items-center gap-2">
              <LegendSwatch className="border-primary bg-card text-primary" />
              {t("legendJudgedThin", { noun: layer.noun })}
            </span>
            <span className="flex items-center gap-2">
              <LegendSwatch className="border-border bg-card text-foreground" />
              {t("legendJudgedNormal", { noun: layer.noun })}
            </span>
          </>
        ) : (
          <>
            <span className="flex items-center gap-2">
              <LegendSwatch className="border-border bg-card text-foreground" />
              {t("legendPlainPlayed", { noun: layer.noun })}
            </span>
            <span className="flex items-center gap-2">
              <LegendSwatch className="border-border bg-card text-muted-foreground/30" />
              {t("legendPlainNot")}
            </span>
          </>
        )}
      </div>

      <p className="mt-6 text-small text-muted-foreground">
        {tournamentsCounted >= CHARACTERISTIC_RELIABLE_FROM
          ? t("reliable", { count: tournamentsCounted })
          : t("preliminary", { count: tournamentsCounted, threshold: CHARACTERISTIC_RELIABLE_FROM })}
      </p>
    </>
  );
}

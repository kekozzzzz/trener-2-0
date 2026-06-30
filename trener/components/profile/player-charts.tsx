"use client";

import { useState } from "react";
import { loadOpenChartAction } from "@/features/profile/actions";
import type { OpenChartView } from "@/features/profile/queries";
import { OpenChartPanel } from "./open-chart-panel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Кнопка «Твои чарты» под профилем игры: раскрывает сетку открываний по позициям —
// как игрок реально открывается по всей дистанции (зеркало, не учебник). Карту грузим
// лениво по первому клику (на странице турниров заранее все руки не тянем).
export function PlayerCharts() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<OpenChartView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) {
      setLoading(true);
      const v = await loadOpenChartAction();
      setView(v);
      setLoaded(true);
      setLoading(false);
    }
  }

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(buttonVariants({ variant: "outline" }))}
      >
        {open ? "Скрыть чарты" : "Твои чарты"}
      </button>

      {open && (
        <div className="mt-6 border border-border bg-card p-6">
          {loading && (
            <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
              Собираю открывания…
            </p>
          )}

          {!loading && !view && (
            <p className="text-small text-muted-foreground">
              Пока нечего показать — загрузи и разбери турниры, чтобы собрать картину открываний.
            </p>
          )}

          {!loading && view && (
            <OpenChartPanel chart={view.chart} tournamentsCounted={view.tournamentsCounted} />
          )}
        </div>
      )}
    </div>
  );
}

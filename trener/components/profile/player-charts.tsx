"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { loadPlayerChartsAction } from "@/features/profile/actions";
import type { PlayerChartsView } from "@/features/profile/queries";
import type { ActionLayers } from "@/features/profile/spot-charts";
import type { OpenerPosition } from "@/config/poker/bb-defense-chart";
import type { OpenPosition } from "@/config/poker/rfi-chart";
import type { PushPosition } from "@/config/poker/push-fold-chart";
import { OpenChartPanel } from "./open-chart-panel";
import { SpotMirrorPanel, type MirrorPosition } from "./spot-mirror-panel";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Виды зеркал — те же пять спотов, что эталоны на /charts (план
// 2026-07-03-твои-чарты-все-споты): открывания, защита BB, против опена,
// изоляция, пуш-фолд.
type ChartKind = "open" | "bb" | "vsopen" | "iso" | "push";
const KINDS: ChartKind[] = ["open", "bb", "vsopen", "iso", "push"];

const OPENERS: OpenerPosition[] = ["UTG", "MP", "HJ", "CO", "BTN"];
const POSITIONS: OpenPosition[] = ["UTG", "MP", "HJ", "CO", "BTN", "SB"];
// MP2 из пуш-чарта показываем игроку как MP (как на эталонной странице /charts).
const PUSH_POSITIONS: { key: PushPosition; label: string }[] = [
  { key: "UTG", label: "UTG" },
  { key: "MP2", label: "MP" },
  { key: "CO", label: "CO" },
  { key: "BTN", label: "BTN" },
  { key: "SB", label: "SB" },
];

// Кнопка «Твои чарты» под профилем игры: раскрывает зеркала всех спотов —
// как игрок реально играет по всей дистанции (зеркало, не учебник). Данные грузим
// лениво по первому клику (на странице турниров заранее все руки не тянем).
export function PlayerCharts() {
  const t = useTranslations("PlayerCharts");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<ChartKind>("open");
  const [view, setView] = useState<PlayerChartsView | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded && !loading) {
      setLoading(true);
      const v = await loadPlayerChartsAction();
      setView(v);
      setLoaded(true);
      setLoading(false);
    }
  }

  // Слои «колл / 3-бет» для защиты BB и игры против опена: колл не судим (серым со
  // счётчиком), 3-бет судим (лаймом — шире нормы, флаг wide уже посчитан агрегатором).
  const callThreeBetLayers = (layers: ActionLayers) => [
    { key: "call", label: t("layerCall"), judged: false, noun: t("nounCall"), cells: layers.call },
    { key: "threebet", label: t("layerThreeBet"), judged: true, noun: t("nounThreeBet"), cells: layers.threeBet },
  ];

  const panel = (v: PlayerChartsView) => {
    switch (kind) {
      case "open":
        return <OpenChartPanel chart={v.open} tournamentsCounted={v.tournamentsCounted} />;
      case "bb": {
        const positions: MirrorPosition[] = OPENERS.map((p) => ({
          key: p,
          label: p,
          layers: callThreeBetLayers(v.spots.bbDefense[p]),
        }));
        return (
          <SpotMirrorPanel
            title={t("bbTitle")}
            intro={t("bbIntro")}
            positions={positions}
            defaultPosition="BTN"
            tournamentsCounted={v.tournamentsCounted}
          />
        );
      }
      case "vsopen": {
        const positions: MirrorPosition[] = POSITIONS.map((p) => ({
          key: p,
          label: p,
          layers: callThreeBetLayers(v.spots.vsOpen[p]),
        }));
        return (
          <SpotMirrorPanel
            title={t("vsOpenTitle")}
            intro={t("vsOpenIntro")}
            positions={positions}
            defaultPosition="BTN"
            tournamentsCounted={v.tournamentsCounted}
          />
        );
      }
      case "iso": {
        const positions: MirrorPosition[] = POSITIONS.map((p) => ({
          key: p,
          label: p,
          layers: [{ key: "iso", label: t("tabIso"), judged: true, noun: t("nounIso"), cells: v.spots.iso[p] }],
        }));
        return (
          <SpotMirrorPanel
            title={t("isoTitle")}
            intro={t("isoIntro")}
            positions={positions}
            defaultPosition="BTN"
            tournamentsCounted={v.tournamentsCounted}
          />
        );
      }
      case "push": {
        const positions: MirrorPosition[] = PUSH_POSITIONS.map((p) => ({
          key: p.key,
          label: p.label,
          layers: [
            { key: "SHORT", label: t("bandShort"), judged: true, noun: t("nounPush"), cells: v.spots.push.SHORT[p.key] },
            { key: "MID", label: t("bandMid"), judged: true, noun: t("nounPush"), cells: v.spots.push.MID[p.key] },
          ],
        }));
        return (
          <SpotMirrorPanel
            title={t("pushTitle")}
            intro={t("pushIntro")}
            positions={positions}
            defaultPosition="SB"
            tournamentsCounted={v.tournamentsCounted}
          />
        );
      }
    }
  };

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={cn(buttonVariants({ variant: "outline" }))}
      >
        {open ? t("hide") : t("show")}
      </button>

      {open && (
        <div className="mt-6 border border-border bg-card p-6">
          {loading && (
            <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
              {t("loading")}
            </p>
          )}

          {!loading && !view && (
            <p className="text-small text-muted-foreground">
              {t("empty")}
            </p>
          )}

          {!loading && view && (
            <>
              {/* Переключатель зеркал — те же споты, что эталоны на /charts */}
              <div className="mb-8 flex flex-wrap gap-2">
                {KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    aria-pressed={kind === k}
                    className={cn(
                      "border px-3 py-2 font-mono text-label uppercase tracking-label transition-colors duration-150 ease-out",
                      kind === k
                        ? "border-primary text-primary"
                        : "border-border text-muted-foreground hover:border-primary"
                    )}
                  >
                    {t(`tab_${k}`)}
                  </button>
                ))}
              </div>
              {panel(view)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

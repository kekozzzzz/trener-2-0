import type { TableSnapshot } from "@/parser/types";
import { detectHeroBBDefense } from "@/parser/bb-defense";
import { detectHeroVsOpen } from "@/parser/vs-open";
import { detectHeroIso } from "@/parser/iso";
import { detectHeroOpenShove } from "@/parser/open-shove";
import type { OpenPosition } from "@/config/poker/rfi-chart";
import { isBBThreeBetSignificantlyWide, type OpenerPosition } from "@/config/poker/bb-defense-chart";
import { isVsOpenThreeBetSignificantlyWide } from "@/config/poker/vs-open-chart";
import { isIsoSignificantlyWide } from "@/config/poker/iso-chart";
import { isOpenShoveSignificantlyWide, type PushPosition, type StackBand } from "@/config/poker/push-fold-chart";
import type { OpenChartCell } from "./open-chart";

// Зеркала остальных спотов для «Твоих чартов» (план 2026-07-03-твои-чарты-все-споты):
// защита BB, против одиночного опена, изоляция лимпера, пуш-фолд. Как и у открываний —
// ЧАСТОТА действий по всей дистанции, не результат. Правило 1: споты находят детекторы
// парсера, «шире нормы» решают грейдеры конфигов эталонов — те же, что на /charts и в
// open-leak, зеркало и эталон разойтись не могут. Чистая функция (без БД) — легко тестить.
//
// Коллы не судим (wide всегда false): грейдеры эталонов флагают только 3-бет вне мягкой
// границы — так решено в конфигах (защита BB и холодный колл — весовые споты).

// Слои защиты BB / против опена: чем коллируешь и чем 3-бетишь — раздельно.
export type ActionLayers = { call: OpenChartCell[]; threeBet: OpenChartCell[] };

export type SpotChartFacts = {
  bbDefense: Record<OpenerPosition, ActionLayers>; // по позиции ОТКРЫВАШКИ
  vsOpen: Record<OpenPosition, ActionLayers>; // по НАШЕЙ позиции (BB — отдельный чарт выше)
  iso: Record<OpenPosition, OpenChartCell[]>; // изоляция лимпера, по нашей позиции
  push: Record<StackBand, Record<PushPosition, OpenChartCell[]>>; // опен-шов, стек-бэнд × позиция
};

const OPENERS: OpenerPosition[] = ["UTG", "MP", "HJ", "CO", "BTN"];
const POSITIONS: OpenPosition[] = ["UTG", "MP", "HJ", "CO", "BTN", "SB"];
const PUSH_POSITIONS: PushPosition[] = ["UTG", "MP2", "CO", "BTN", "SB"];
const BANDS: StackBand[] = ["SHORT", "MID"];

type Counts = Map<string, number>;
const bump = (m: Counts, code: string) => m.set(code, (m.get(code) ?? 0) + 1);

// Счётчики → клетки чарта: сортировка по частоте, флаг wide решает переданный грейдер.
function toCells(counts: Counts, wide: (code: string) => boolean): OpenChartCell[] {
  return [...counts.entries()]
    .map(([code, count]) => ({ code, count, wide: wide(code) }))
    .sort((a, b) => b.count - a.count);
}

export function aggregateSpotCharts(hands: { tableData: unknown }[]): SpotChartFacts {
  const bbCall = new Map(OPENERS.map((p) => [p, new Map<string, number>()]));
  const bb3bet = new Map(OPENERS.map((p) => [p, new Map<string, number>()]));
  const voCall = new Map(POSITIONS.map((p) => [p, new Map<string, number>()]));
  const vo3bet = new Map(POSITIONS.map((p) => [p, new Map<string, number>()]));
  const isoCounts = new Map(POSITIONS.map((p) => [p, new Map<string, number>()]));
  const pushCounts = new Map(
    BANDS.map((b) => [b, new Map(PUSH_POSITIONS.map((p) => [p, new Map<string, number>()]))]),
  );

  for (const hand of hands) {
    const snap = hand.tableData as unknown as TableSnapshot;

    // Споты взаимоисключающие по построению детекторов (разные конфигурации префлопа),
    // но прогоняем все четыре — каждый сам вернёт null, если раздача не его.
    const bb = detectHeroBBDefense(snap);
    if (bb && bb.action !== "FOLD") {
      bump((bb.action === "CALL" ? bbCall : bb3bet).get(bb.openerPosition)!, bb.code);
    }

    const vo = detectHeroVsOpen(snap);
    if (vo && vo.action !== "FOLD") {
      bump((vo.action === "CALL" ? voCall : vo3bet).get(vo.heroPosition)!, vo.code);
    }

    const iso = detectHeroIso(snap);
    if (iso) bump(isoCounts.get(iso.heroPosition)!, iso.code);

    const push = detectHeroOpenShove(snap);
    if (push) bump(pushCounts.get(push.band)!.get(push.position)!, push.code);
  }

  const bbDefense = Object.fromEntries(
    OPENERS.map((p) => [
      p,
      {
        call: toCells(bbCall.get(p)!, () => false),
        threeBet: toCells(bb3bet.get(p)!, (code) => isBBThreeBetSignificantlyWide(p, code)),
      },
    ]),
  ) as Record<OpenerPosition, ActionLayers>;

  const vsOpen = Object.fromEntries(
    POSITIONS.map((p) => [
      p,
      {
        call: toCells(voCall.get(p)!, () => false),
        threeBet: toCells(vo3bet.get(p)!, (code) => isVsOpenThreeBetSignificantlyWide(p, code)),
      },
    ]),
  ) as Record<OpenPosition, ActionLayers>;

  const iso = Object.fromEntries(
    POSITIONS.map((p) => [p, toCells(isoCounts.get(p)!, (code) => isIsoSignificantlyWide(p, code))]),
  ) as Record<OpenPosition, OpenChartCell[]>;

  const push = Object.fromEntries(
    BANDS.map((b) => [
      b,
      Object.fromEntries(
        PUSH_POSITIONS.map((p) => [
          p,
          toCells(pushCounts.get(b)!.get(p)!, (code) => isOpenShoveSignificantlyWide(b, p, code)),
        ]),
      ),
    ]),
  ) as Record<StackBand, Record<PushPosition, OpenChartCell[]>>;

  return { bbDefense, vsOpen, iso, push };
}

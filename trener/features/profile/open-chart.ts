import type { TableSnapshot } from "@/parser/types";
import { detectHeroOpen } from "@/parser/open-raise";
import {
  isOpenPosition,
  isOpenSignificantlyWide,
  openChartPosition,
  type OpenPosition,
} from "@/config/poker/rfi-chart";

// Детерминированная карта открываний игрока по всей дистанции — ЗЕРКАЛО «как ты
// открываешься», фундамент кнопки «Твои чарты». Правило 1: факт открытия, код руки и
// сверку с RFI-чартом («заметно шире») считает код, не LLM.
//
// Здесь НЕ результат руки (выигрыш/проигрыш = дисперсия, сходится за тысячи турниров),
// а ЧАСТОТА открытия (надёжна уже от ~30 турниров). Базовый чарт игроку не показываем
// как «эталон» — он лишь решает флаг `wide`. Чистая функция (без БД) — легко тестить.

// Одна открытая клетка чарта: код руки, сколько раз открыта из этой позиции и шире ли
// она нормы (кандидат в утечку, не приговор — порог выборки решает показ).
export type OpenChartCell = { code: string; count: number; wide: boolean };

// Карта открываний по позициям. Только реально открытые руки (count > 0).
export type OpenChartFacts = Record<OpenPosition, OpenChartCell[]>;

const POSITIONS: OpenPosition[] = ["UTG", "MP", "HJ", "CO", "BTN", "SB"];

export function aggregateOpenChart(hands: { tableData: unknown }[]): OpenChartFacts {
  const counts: Record<OpenPosition, Map<string, number>> = {
    UTG: new Map(),
    MP: new Map(),
    HJ: new Map(),
    CO: new Map(),
    BTN: new Map(),
    SB: new Map(),
  };

  for (const hand of hands) {
    const snap = hand.tableData as unknown as TableSnapshot;
    const open = detectHeroOpen(snap);
    if (!open) continue;

    // detectHeroOpen отдаёт ГРУБУЮ позицию (EARLY/HJ/CO/BTN/SB). Ранние разводим на
    // UTG/MP по точному positionName из снимка (чарт разводит их с 2026-06-29).
    // Устойчиво к будущей правке детектора: если он начнёт отдавать уже позицию чарта
    // (UTG/MP) — берём как есть. BB/OTHER → null, не судим.
    const hero = snap.seats.find((s) => s.label === "Hero");
    const pos = isOpenPosition(open.position)
      ? open.position
      : hero
        ? openChartPosition(hero.position, hero.positionName)
        : null;
    if (!pos) continue;

    const m = counts[pos];
    m.set(open.code, (m.get(open.code) ?? 0) + 1);
  }

  const out = {} as OpenChartFacts;
  for (const pos of POSITIONS) {
    out[pos] = [...counts[pos].entries()]
      .map(([code, count]) => ({ code, count, wide: isOpenSignificantlyWide(pos, code) }))
      .sort((a, b) => b.count - a.count);
  }
  return out;
}

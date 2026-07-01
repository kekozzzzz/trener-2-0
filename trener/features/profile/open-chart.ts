import type { TableSnapshot } from "@/parser/types";
import { detectHeroOpen } from "@/parser/open-raise";
import { detectHeroSbLimp } from "@/parser/sb-limp";
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

// Одна клетка чарта: код руки, сколько раз сыграна из этой позиции и шире ли она нормы
// (для рейзов — кандидат в утечку; для лимпов всегда false, лимп не судим).
export type OpenChartCell = { code: string; count: number; wide: boolean };

// Карта: рейз-открывания по позициям + отдельно SB-лимпы (комплит блайнда при фолде
// до тебя — законная часть стратегии SB, показываем отдельным слоем, не как утечку).
export type OpenChartFacts = {
  raise: Record<OpenPosition, OpenChartCell[]>;
  sbLimp: OpenChartCell[];
};

const POSITIONS: OpenPosition[] = ["UTG", "MP", "HJ", "CO", "BTN", "SB"];

export function aggregateOpenChart(hands: { tableData: unknown }[]): OpenChartFacts {
  const raiseCounts: Record<OpenPosition, Map<string, number>> = {
    UTG: new Map(),
    MP: new Map(),
    HJ: new Map(),
    CO: new Map(),
    BTN: new Map(),
    SB: new Map(),
  };
  const limpCounts = new Map<string, number>();

  for (const hand of hands) {
    const snap = hand.tableData as unknown as TableSnapshot;

    // Рейз-открывание (RFI). detectHeroOpen отдаёт ГРУБУЮ позицию (EARLY/HJ/CO/BTN/SB);
    // ранние разводим на UTG/MP по positionName. Устойчиво к будущей правке детектора:
    // если он начнёт отдавать уже позицию чарта (UTG/MP) — берём как есть.
    const open = detectHeroOpen(snap);
    if (open) {
      const hero = snap.seats.find((s) => s.label === "Hero");
      const pos = isOpenPosition(open.position)
        ? open.position
        : hero
          ? openChartPosition(hero.position, hero.positionName)
          : null;
      if (pos) {
        const m = raiseCounts[pos];
        m.set(open.code, (m.get(open.code) ?? 0) + 1);
      }
    }

    // SB-лимп (комплит блайнда при фолде до тебя). С рейзом взаимоисключающи.
    const limp = detectHeroSbLimp(snap);
    if (limp) limpCounts.set(limp, (limpCounts.get(limp) ?? 0) + 1);
  }

  const raise = {} as Record<OpenPosition, OpenChartCell[]>;
  for (const pos of POSITIONS) {
    raise[pos] = [...raiseCounts[pos].entries()]
      .map(([code, count]) => ({ code, count, wide: isOpenSignificantlyWide(pos, code) }))
      .sort((a, b) => b.count - a.count);
  }

  const sbLimp = [...limpCounts.entries()]
    .map(([code, count]) => ({ code, count, wide: false }))
    .sort((a, b) => b.count - a.count);

  return { raise, sbLimp };
}

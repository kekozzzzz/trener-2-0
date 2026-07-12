// Чарт КОЛЛА ПРОТИВ РЕСТИЛА: мы открылись, в нас прилетел 3-бет-олл-ин 10–20bb —
// коллировать или фолдить. Зеркало resteal-chart.ts (та же пара осей): ширина ИХ
// джема зависит от НАШЕЙ позиции опена (против поздних опенов реджемят сильно шире),
// и от стека джемящего. Правило 3: диапазоны в конфиге. Правило 1: попадание считает код.
//
// Данные: то же среднее, что у рестил-чарта (ICMIZER: против реджема ~19% на 20bb
// опенер BTN продолжает примерно 66+/AT+ — прямой якорь этого чарта; Nash-таблицы
// колла: против узкого велью-джема колл заметно тайтовее).

import { buildRange, withTolerance, isWiderThan } from "./hand-range";
import type { RestealBand, RestealOpenerGroup } from "./resteal-chart";

// Оси: группа НАШЕЙ открывавшей позиции (она задаёт ширину их реджема) × стек джемящего.
const CALL_RAW: Record<RestealOpenerGroup, Record<RestealBand, string[]>> = {
  // Мы открылись с поздней → нас реджемят широко → коллируем шире (якорь ICMIZER 66+/AT+).
  LATE: {
    HIGH: ["66+", "ATs+", "ATo+", "KQs"],
    LOW: ["55+", "A9s+", "ATo+", "KQs", "KQo"], // джем 10-14bb ещё шире → колл чуть шире
  },
  // Мы открылись с ранней → реджем в нас велью-тяжёлый → колл только сильным.
  EARLY: {
    HIGH: ["99+", "AQs+", "AQo+"],
    LOW: ["88+", "AJs+", "AQo+", "KQs"],
  },
};

const GROUPS: RestealOpenerGroup[] = ["EARLY", "LATE"];
const BANDS: RestealBand[] = ["LOW", "HIGH"];

const CALL_RANGE = Object.fromEntries(
  GROUPS.map((g) => [g, Object.fromEntries(BANDS.map((b) => [b, buildRange(CALL_RAW[g][b])]))]),
) as Record<RestealOpenerGroup, Record<RestealBand, Set<string>>>;

const CALL_TOLERANCE = Object.fromEntries(
  GROUPS.map((g) => [g, Object.fromEntries(BANDS.map((b) => [b, withTolerance(CALL_RANGE[g][b], 1)]))]),
) as Record<RestealOpenerGroup, Record<RestealBand, Set<string>>>;

export function isCallVsRestealSignificantlyWide(group: RestealOpenerGroup, band: RestealBand, code: string): boolean {
  return isWiderThan(CALL_RANGE[group][band], CALL_TOLERANCE[group][band], code);
}

export type CallVsRestealCellState = "CALL" | "BORDER" | "OUT";

export function callVsRestealCellState(group: RestealOpenerGroup, band: RestealBand, code: string): CallVsRestealCellState {
  if (CALL_RANGE[group][band].has(code)) return "CALL";
  if (CALL_TOLERANCE[group][band].has(code)) return "BORDER";
  return "OUT";
}

// Коды диапазона, которым опенер КОЛЛИРУЕТ рестил Hero — для эквити руки Hero «при
// колле» (parser/chart-equity-fact.ts, факты-v2 фаза 1). Тот же Set, что грейдер.
export function callVsRestealRangeCodes(group: RestealOpenerGroup, band: RestealBand): string[] {
  return [...CALL_RANGE[group][band]];
}

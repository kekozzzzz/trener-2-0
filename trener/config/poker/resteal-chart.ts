// Чарт РЕСТИЛА — 3-бет-олл-ин на стеке 10–25bb против ОДИНОЧНОГО опена (без коллеров
// между опеном и Hero). Правило 3: диапазоны в конфиге. Правило 1: попадание руки в
// ренж считает код, не LLM.
//
// Данные: среднее трёх публичных источников (задание Артёма 2026-07-05 «выбери три,
// сделай среднее»; его собственные чарты добавим, когда найдёт):
//  1) ICMIZER (blog, равновесия рестила): реджем BB vs BTN-опен на 20bb ≈ 19% рук
//     (chipEV Nash), опенер продолжает ~66+/AT+ — якорь ШИРИНЫ против поздних.
//  2) Upswing Poker (short-stacked 3-betting): ядро «3-бет/колл-шов» ≈ топ-7% велью
//     + мелкие тузы-блокеры как полублеф — якорь СОСТАВА (велью + Ax-блокеры).
//  3) Nash push/call (HoldemResources, классические таблицы): против РАННИХ опенов
//     диапазон режется в разы (коллер тайтовее и сильнее) — якорь асимметрии позиций.
// Сырой солверный низ обрезан консервативно, как в остальных чартах продукта.
//
// Слои как у 3-бета защиты BB: JAM (ядро — джем всегда), JAM_WEIGHT (весом — можно,
// не ошибка), полоса допуска 1 шаг. Грейдер флагает только ЯВНО вне (велью ∪ вес ∪ допуск).

import { buildRange, withTolerance, isWiderThan } from "./hand-range";
import type { OpenPosition } from "./rfi-chart";

// Группа позиции ОТКРЫВАШКИ: против ранних (UTG/MP) рестил в разы уже, чем против
// поздних (HJ/CO/BTN/SB — широкие опены). SB-опен тоже LATE (самый широкий).
export type RestealOpenerGroup = "EARLY" | "LATE";
// Стек-бэнд Hero: LOW = 10–13.9bb (почти пуш-фолд, шире), HIGH = 14–25bb (класс. рестил;
// ревизия 2026-07-06: верх поднят с 20 до 25bb — реджем на 20-25bb стандартен, глубже
// рестил делается обычным 3-бетом, а не олл-ином, и джем-чартом не судится).
export type RestealBand = "LOW" | "HIGH";

const JAM_CORE: Record<RestealOpenerGroup, Record<RestealBand, string[]>> = {
  LATE: {
    HIGH: ["66+", "ATs+", "AJo+", "KQs"],
    LOW: ["44+", "A7s+", "A5s", "ATo+", "KJs+", "KQo"],
  },
  EARLY: {
    HIGH: ["99+", "AQs+", "AKo"],
    LOW: ["77+", "ATs+", "AQo+"],
  },
};

const JAM_WEIGHT: Record<RestealOpenerGroup, Record<RestealBand, string[]>> = {
  LATE: {
    // до ~19% вместе с ядром (якорь ICMIZER 20bb vs BTN)
    HIGH: ["22", "33", "44", "55", "A2s", "A3s", "A4s", "A5s", "A6s", "A7s", "A8s", "A9s", "ATo", "A9o", "KQo", "KJs", "QJs", "JTs"],
    // на 10–14bb шире: фолд-эквити та же, риск меньше
    LOW: ["22", "33", "A2s", "A3s", "A4s", "A6s", "A5o", "A6o", "A7o", "A8o", "A9o", "KTs", "QTs", "QJs", "JTs", "KJo", "QJo", "T9s"],
  },
  EARLY: {
    HIGH: ["77", "88", "AJs", "ATs", "AQo", "KQs", "A5s", "A4s"],
    LOW: ["55", "66", "A5s", "A6s", "A7s", "A8s", "A9s", "AJo", "KQs", "KJs"],
  },
};

const GROUPS: RestealOpenerGroup[] = ["EARLY", "LATE"];
const BANDS: RestealBand[] = ["LOW", "HIGH"];

const JAM_RANGE = Object.fromEntries(
  GROUPS.map((g) => [
    g,
    Object.fromEntries(BANDS.map((b) => [b, buildRange([...JAM_CORE[g][b], ...JAM_WEIGHT[g][b]])])),
  ]),
) as Record<RestealOpenerGroup, Record<RestealBand, Set<string>>>;

const JAM_TOLERANCE = Object.fromEntries(
  GROUPS.map((g) => [g, Object.fromEntries(BANDS.map((b) => [b, withTolerance(JAM_RANGE[g][b], 1)]))]),
) as Record<RestealOpenerGroup, Record<RestealBand, Set<string>>>;

const JAM_CORE_SET = Object.fromEntries(
  GROUPS.map((g) => [g, Object.fromEntries(BANDS.map((b) => [b, buildRange(JAM_CORE[g][b])]))]),
) as Record<RestealOpenerGroup, Record<RestealBand, Set<string>>>;

// Группа опенера из позиции чарта (openChartPosition уже свёл ранние к UTG/MP).
export function restealOpenerGroup(pos: OpenPosition): RestealOpenerGroup {
  return pos === "UTG" || pos === "MP" ? "EARLY" : "LATE";
}

// Стек-бэнд рестила по стеку Hero в BB: вне 10–25bb спот не судим (короче — пуш-фолд
// с другой математикой, глубже — обычный 3-бет, не олл-ин).
export function restealBandFor(stackBb: number): RestealBand | null {
  if (stackBb < 10 || stackBb > 25) return null;
  return stackBb < 14 ? "LOW" : "HIGH";
}

// Рестил «заметно шире нормы»: рука вне (ядро ∪ вес ∪ допуск).
export function isRestealSignificantlyWide(group: RestealOpenerGroup, band: RestealBand, code: string): boolean {
  return isWiderThan(JAM_RANGE[group][band], JAM_TOLERANCE[group][band], code);
}

// Слой клетки: JAM — ядро (стандартный рестил), JAM_WEIGHT — весом (можно, не ошибка),
// BORDER — полоса допуска, OUT — по эталону не джемится.
export type RestealCellState = "JAM" | "JAM_WEIGHT" | "BORDER" | "OUT";

export function restealCellState(group: RestealOpenerGroup, band: RestealBand, code: string): RestealCellState {
  if (JAM_CORE_SET[group][band].has(code)) return "JAM";
  if (JAM_RANGE[group][band].has(code)) return "JAM_WEIGHT";
  if (JAM_TOLERANCE[group][band].has(code)) return "BORDER";
  return "OUT";
}

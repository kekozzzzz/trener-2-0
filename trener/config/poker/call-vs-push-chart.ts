// Чарт КОЛЛА против опен-олл-ина (пуш первым в банк на коротком стеке ≤14bb).
// Правило 3: диапазоны в конфиге. Правило 1: попадание руки в ренж считает код.
//
// Данные: опора — уже утверждённый в продукте BB_CALL_VS_PUSH (push-fold-chart.ts:
// колл BB против пуша 10bb vsUTG / vsBTN) + два публичных источника (задание Артёма
// 2026-07-05 «выбери три, сделай среднее»):
//  1) Nash call-таблицы HoldemResources (классика, HU): колл против широкого позднего
//     пуша заметно шире интуиции (на ≤10bb коллируются почти все тузы и бродвеи),
//     против SHORT-пуша шире, чем против MID, — якорь зависимости от стека пушера.
//  2) ICMIZER: против пуша с ранней позиции коллер держит только премиумы — якорь
//     асимметрии позиций (та же логика, что THREEBET_VALUE защиты BB).
// Оговорка: чарт НЕ моделирует живых игроков за спиной коллера — они делают колл
// тайтовее; это покрывается полосой допуска и словами тренера, не грейдером.
//
// Слоя «весом» нет — колл против пуша ближе к бинарному (Nash); допуск 1 шаг.

import { buildRange, withTolerance, isWiderThan } from "./hand-range";
import type { OpenPosition } from "./rfi-chart";
import type { StackBand } from "./push-fold-chart";

export type PusherGroup = "EARLY" | "LATE";

// SHORT — пуш до 10bb (коллируем шире), MID — пуш 10–14bb (тайтовее).
const CALL_RAW: Record<PusherGroup, Record<StackBand, string[]>> = {
  EARLY: {
    SHORT: ["55+", "A9s+", "ATo+", "KQs", "KJs", "KQo"],
    MID: ["66+", "ATs+", "AQo+", "KQs"], // ≈ утверждённый BB_CALL_VS_PUSH.vsUTG
  },
  LATE: {
    SHORT: ["22+", "A2s+", "K5s+", "Q8s+", "J8s+", "T8s+", "98s", "A2o+", "K9o+", "QTo+", "JTo"],
    MID: ["22+", "A2s+", "K7s+", "Q9s+", "J9s+", "T9s", "A7o+", "KTo+", "QJo"], // = BB_CALL_VS_PUSH.vsBTN
  },
};

const GROUPS: PusherGroup[] = ["EARLY", "LATE"];
const BANDS: StackBand[] = ["SHORT", "MID"];

const CALL_RANGE = Object.fromEntries(
  GROUPS.map((g) => [g, Object.fromEntries(BANDS.map((b) => [b, buildRange(CALL_RAW[g][b])]))]),
) as Record<PusherGroup, Record<StackBand, Set<string>>>;

const CALL_TOLERANCE = Object.fromEntries(
  GROUPS.map((g) => [g, Object.fromEntries(BANDS.map((b) => [b, withTolerance(CALL_RANGE[g][b], 1)]))]),
) as Record<PusherGroup, Record<StackBand, Set<string>>>;

export function pusherGroup(pos: OpenPosition): PusherGroup {
  return pos === "UTG" || pos === "MP" ? "EARLY" : "LATE";
}

// Колл «заметно шире нормы»: рука вне (чарт ∪ допуск).
export function isCallVsPushSignificantlyWide(group: PusherGroup, band: StackBand, code: string): boolean {
  return isWiderThan(CALL_RANGE[group][band], CALL_TOLERANCE[group][band], code);
}

export type CallVsPushCellState = "CALL" | "BORDER" | "OUT";

export function callVsPushCellState(group: PusherGroup, band: StackBand, code: string): CallVsPushCellState {
  if (CALL_RANGE[group][band].has(code)) return "CALL";
  if (CALL_TOLERANCE[group][band].has(code)) return "BORDER";
  return "OUT";
}

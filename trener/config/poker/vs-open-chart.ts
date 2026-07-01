// Чарт «против одиночного опена» по НАШЕЙ позиции (не из BB): 3-бет велью + блеф.
// Правило 3: диапазоны в конфиге. Правило 1: попадание руки в ренж считает код.
// Данные: beginner-баланс, среднее его солверных VPIP-чартов и внешних (см.
// memory/project_vpip_vs_raiser_chart). Самый размытый спот — упрощён; холодный колл
// в чарте НЕ грейдим (в основном IP, нюансный), только 3-бет.
//
// Применение — подсказка «3-бет против опена шире нормы» (как open-leak / BB-3-бет):
// граница 3-бета МЯГКАЯ (велью + блеф весом), флагаем только явный спью вне неё.
// Защита BB (Hero в BB) — отдельный чарт [bb-defense-chart]; здесь Hero НЕ в BB.

import { buildRange, withTolerance, isWiderThan } from "./hand-range";
import { openChartPosition, type OpenPosition } from "./rfi-chart";

// UTG/MP объединены в чарте Артёма (одинаковый ренж); резолвер сводит ранние к UTG/MP.
const THREEBET_VALUE: Record<OpenPosition, string[]> = {
  UTG: ["QQ+", "AKs", "AKo", "AQs"],
  MP: ["QQ+", "AKs", "AKo", "AQs"],
  HJ: ["QQ+", "AKs", "AKo", "AQs"],
  CO: ["JJ+", "AKs", "AKo", "AQs", "AQo"],
  BTN: ["JJ+", "AKs", "AKo", "AQs", "AQo"],
  SB: ["QQ+", "AKs", "AKo", "AQs"],
};

const THREEBET_BLUFF: Record<OpenPosition, string[]> = {
  UTG: ["A5s", "A4s", "KJs"],
  MP: ["A5s", "A4s", "KJs"],
  HJ: ["A5s", "A4s", "A3s", "KJs", "AJo", "KQo"],
  CO: ["A5s", "A4s", "A3s", "KJs", "KQo", "AJo", "KTo", "76s", "65s"],
  BTN: ["A5s", "A4s", "A3s", "A2s", "K9s+", "KJo", "QJo", "ATo", "KTo", "QTo", "JTo"],
  SB: ["A5s", "A4s", "A3s", "KJs", "QJs", "JTs"],
};

const POSITIONS: OpenPosition[] = ["UTG", "MP", "HJ", "CO", "BTN", "SB"];
const POSITION_SET = new Set<string>(POSITIONS);

const THREEBET_RANGE = Object.fromEntries(
  POSITIONS.map((p) => [p, buildRange([...THREEBET_VALUE[p], ...THREEBET_BLUFF[p]])]),
) as Record<OpenPosition, Set<string>>;

const THREEBET_TOLERANCE = Object.fromEntries(
  POSITIONS.map((p) => [p, withTolerance(THREEBET_RANGE[p], 1)]),
) as Record<OpenPosition, Set<string>>;

export function isVsOpenPosition(pos: string): pos is OpenPosition {
  return POSITION_SET.has(pos);
}

// Наша позиция для чарта из грубой позиции + точного имени (тот же резолвер, что RFI).
export function vsOpenPosition(coarsePos: string, positionName?: string): OpenPosition | null {
  return openChartPosition(coarsePos, positionName);
}

// 3-бет против опена «заметно шире нормы»: рука вне (велью ∪ блеф ∪ допуск) для нашей
// позиции. false = 3-бет в пределах нормы либо позицию не судим.
export function isVsOpenThreeBetSignificantlyWide(heroPos: string, code: string): boolean {
  if (!isVsOpenPosition(heroPos)) return false;
  return isWiderThan(THREEBET_RANGE[heroPos], THREEBET_TOLERANCE[heroPos], code);
}

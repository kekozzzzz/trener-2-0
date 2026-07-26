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

// Ревизия 2026-07-06 (согласована логика с правкой Артёма по защите BB от 04.07:
// «3-бет TT против позднего опена — нормальная линия, не спью»): против поздних
// позиций в весовой слой добавлены TT (CO/BTN/SB), 99 и AJs/KQs (BTN).
// Ревизия 2026-07-06 (правка Артёма: «3-бет KQs только с баттона — бред»): KQs
// добавлен весом на всех позициях. Заодно закрыты инверсии «оффсьютная в чарте, а
// одномастная той же руки — нет» (QJo без QJs и т.п.) и дыры вида KTo без KJo/ATo.
const THREEBET_BLUFF: Record<OpenPosition, string[]> = {
  UTG: ["A5s", "A4s", "KQs", "KJs"],
  MP: ["A5s", "A4s", "KQs", "KJs"],
  HJ: ["JJ", "AJs", "A5s", "A4s", "A3s", "KQs", "KJs", "AQo", "AJo", "KQo"],
  CO: ["TT", "AJs", "ATs", "A5s", "A4s", "A3s", "KQs", "KJs", "KTs", "KQo", "KJo", "AJo", "ATo", "KTo", "76s", "65s"],
  BTN: ["TT", "99", "AJs", "ATs", "A9s", "A5s", "A4s", "A3s", "A2s", "K9s+", "QJs", "QTs", "JTs", "KQo", "KJo", "QJo", "AJo", "ATo", "KTo", "QTo", "JTo"],
  SB: ["JJ", "TT", "A5s", "A4s", "A3s", "KQs", "KJs", "QJs", "JTs"],
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

// Слой клетки для страницы эталонного чарта (страница /charts): THREEBET — велью,
// THREEBET_BLUFF — блеф весом, BORDER — граница допуска, OUT — 3-бет не рекомендован
// (колл или фолд — холодный колл чартом сознательно не судится, спот нюансный).
// Из тех же множеств, что детектор — страница и грейдер не могут разойтись.
export type VsOpenCellState = "THREEBET" | "THREEBET_BLUFF" | "BORDER" | "OUT";

const THREEBET_VALUE_SET = Object.fromEntries(
  POSITIONS.map((p) => [p, buildRange(THREEBET_VALUE[p])]),
) as Record<OpenPosition, Set<string>>;

const THREEBET_BLUFF_SET = Object.fromEntries(
  POSITIONS.map((p) => [p, buildRange(THREEBET_BLUFF[p])]),
) as Record<OpenPosition, Set<string>>;

export function vsOpenCellState(pos: OpenPosition, code: string): VsOpenCellState {
  if (THREEBET_VALUE_SET[pos].has(code)) return "THREEBET";
  if (THREEBET_BLUFF_SET[pos].has(code)) return "THREEBET_BLUFF";
  if (THREEBET_TOLERANCE[pos].has(code)) return "BORDER";
  return "OUT";
}

// Эталонный диапазон 3-бета — запасной факт для вердикта, когда игрок САМ диапазон не
// отметил (план 2026-07-26-эталонный-3бет-диапазон.md). Тип принимаем строковыми
// литералами, а не типом из parser/opponent-profile: конфиг не должен зависеть от
// бизнес-логики (правило слоёв), структурная совместимость с OpponentFact достаточна.
//
// Подстройка ТОЛЬКО при confidence "solid" (мало раздач на оппонента — не гадаем):
// NIT — только велью (без блефовых комбо, диапазон уже); FISH/LAG — велью+блеф+допуск
// (THREEBET_TOLERANCE, тот же «один шаг шире», что и у грейдера спью-3-бета); REG или
// нет данных/только "tentative" — база (велью+блеф) без изменений.
export function referenceThreeBetRange(
  pos: OpenPosition,
  opponentType?: "FISH" | "LAG" | "NIT" | "REG",
  confidence?: "tentative" | "solid",
): ReadonlySet<string> {
  if (confidence === "solid") {
    if (opponentType === "NIT") return THREEBET_VALUE_SET[pos];
    if (opponentType === "FISH" || opponentType === "LAG") return THREEBET_TOLERANCE[pos];
  }
  return THREEBET_RANGE[pos];
}

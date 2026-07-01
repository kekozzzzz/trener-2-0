// Чарт сквиза: 3-бет поверх опена + как минимум одного коллера. Правило 3: диапазоны
// в конфиге. Правило 1: попадание руки в ренж считает код.
//
// ВАЖНО: ширина сквиза СИЛЬНО спот-зависима — из блайндов против позднего опена сквиз
// очень широк (у Артёма BB vs CO+SB = ~33% сквиза, включая офсьют-тузы блокерами), а
// из ранней/OOP — узкий велью-тяжёлый. Единым чартом это честно не покрыть. Поэтому
// грейдер ЛОЯЛЬНЫЙ: флагаем ТОЛЬКО заведомый мусор, который не сквиз ни из какой
// позиции (низкий офсьют без туза). Тонкие/широкие сквизы не трогаем — велью-акцент
// объясняет LLM в промпте, но «шире нормы» жёстко не судим.

import { buildRange, withTolerance, isWiderThan } from "./hand-range";
import { openChartPosition, type OpenPosition } from "./rfi-chart";

// Лояльная граница «вообще-то сквизуемо где-нибудь» — широкая (как самый широкий
// спот, блайнды vs поздний опен): все пары, весь suited-верх, офсьют-тузы, бродвейный
// офсьют. Вне неё — низкий офсьют без туза (72o, J4o, K5o и т.п.) = не сквиз ниоткуда.
const SQUEEZABLE = buildRange([
  "22+", "A2s+", "K2s+", "Q4s+", "J6s+", "T6s+", "96s+", "85s+", "75s+", "64s+", "54s",
  "A2o+", "K9o+", "Q9o+", "J9o+", "T9o",
]);
const SQUEEZABLE_TOLERANCE = withTolerance(SQUEEZABLE, 1);

export function squeezePosition(coarsePos: string, positionName?: string): OpenPosition | null {
  return openChartPosition(coarsePos, positionName);
}

// Сквиз «заведомо мусорный»: рука вне широкой границы «сквизуемо где-нибудь» — не
// сквиз ни из какой позиции. Позицию НЕ учитываем (граница лояльная общая). false =
// сквиз хотя бы где-то оправдан, жёстко не судим.
export function isSqueezeSignificantlyWide(_heroPos: string, code: string): boolean {
  return isWiderThan(SQUEEZABLE, SQUEEZABLE_TOLERANCE, code);
}

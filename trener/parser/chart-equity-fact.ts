import type { TableSnapshot } from "./types";
import { preflopEquityVsRangeFast } from "./preflop-equity";
import { detectHeroCallVsPush } from "./call-vs-push";
import { detectHeroResteal } from "./resteal";
import { detectHeroBBDefense } from "./bb-defense";
import { pushPosition, pushRangeCodes } from "@/config/poker/push-fold-chart";
import { callVsRestealRangeCodes } from "@/config/poker/call-vs-resteal-chart";
import { rfiOpenRange, openChartPosition } from "@/config/poker/rfi-chart";
import { combosOf, percentOf } from "@/config/poker/hand-grid";

// Факты-v2, фазы 1-2: эквити руки Hero против ЧАРТОВОГО диапазона соперника (фаза 1)
// и готовое ФОЛД-ЭКВИТИ рестила по чартам (фаза 2). Там, где диапазон соперника
// формализован нашими же чартами (пуш-фолд, колл-vs-рестил, RFI), парсер отдаёт
// готовый процент — быстрый режим не «прикидывает у себя в голове», а берёт число
// (правило 1). Проценты эквити — из preflop-equity.ts (мгновенная таблица класс×класс,
// запечённая Monte Carlo; та же математика, что сетка 13×13 в диалоге); доли диапазонов
// — прямой подсчёт комбо (config/poker/hand-grid), как счётчик «N комбо · X%» на /charts.
//
// Диапазон соперника берём из ТЕХ ЖЕ Set, что грейдер и страница /charts (pushRangeCodes,
// callVsRestealRangeCodes, rfiOpenRange), поэтому эквити и вердикт чарта не разойдутся.
//
// Возвращает строки для renderHandFacts (пусто, если спот не попал ни в один чарт).

// Слово-сравнение эквити с ценой колла (пот-оддс) — чтобы у модели была готовая связка
// «выше/ниже порога», а не только два голых числа.
function vsThresholdWord(equity: number, threshold: number): string {
  const gap = equity - threshold;
  if (gap >= 8) return ` — заметно выше цены колла ≈${threshold}% (пот-оддс), колл с запасом`;
  if (gap >= 2) return ` — выше цены колла ≈${threshold}% (пот-оддс)`;
  if (gap >= -2) return ` — вплотную к цене колла ≈${threshold}% (пот-оддс), спот близкий`;
  return ` — ниже цены колла ≈${threshold}% (пот-оддс)`;
}

// preflopCallThresholdPct — цена колла (пот-оддс) префлоп-олл-ина из computeHandFacts;
// null, когда в раздаче нет префлоп-решения Hero перед олл-ином (спот не колл-vs-пуш).
export function renderChartEquityFacts(
  snapshot: TableSnapshot,
  preflopCallThresholdPct: number | null,
): string[] {
  const lines: string[] = [];

  // 1. Колл / ре-пуш против опен-олл-ина короткого. Эквити руки Hero против ТОЧНОГО
  //    пуш-диапазона пушера (его позиция × стек-бэнд по пуш-чарту). Колл решается
  //    сравнением этого эквити с ценой колла; ре-пуш добавляет ещё изоляцию (фаза 3).
  const cvp = detectHeroCallVsPush(snapshot);
  if (cvp && cvp.action === "CALL") {
    const pusherSeat = snapshot.seats.find((s) => s.label === cvp.pusherLabel);
    const pushPos = pusherSeat ? pushPosition(pusherSeat.position, pusherSeat.positionName) : null;
    if (pusherSeat && pushPos) {
      const eq = preflopEquityVsRangeFast(snapshot.heroCards, pushRangeCodes(cvp.pusherBand, pushPos));
      if (eq) {
        const stack = cvp.pusherBand === "SHORT" ? "≤10 BB" : "10-14 BB";
        const posName = pusherSeat.positionName ?? pusherSeat.position;
        const vs = preflopCallThresholdPct !== null ? vsThresholdWord(eq.equityPct, preflopCallThresholdPct) : "";
        const how = cvp.heroJammed ? "ре-пуша поверх" : "колла";
        lines.push(
          `Эквити ${cvp.code} против пуш-диапазона опен-олл-ина ${posName} ${stack} (${eq.combosLive} комбо): ≈${eq.equityPct}%${vs}. Это эквити ${how} при вскрытии против ВСЕГО его пуша (велью + блокеры + мусор на тильте), а не против «топа» диапазона.`,
        );
      }
    }
  }

  // 2. Рестил (Hero 3-бет-олл-ин против одиночного опена). Эквити ПРИ КОЛЛЕ — против
  //    диапазона, которым опенер продолжает по чарту колл-vs-рестил (фолды сюда не
  //    входят: это вторая половина пуша — фолд-эквити, фаза 2). Слабое эквити при колле
  //    само по себе рестил не хоронит — коллируют узко.
  const rs = detectHeroResteal(snapshot);
  if (rs) {
    const continueCodes = callVsRestealRangeCodes(rs.openerGroup, rs.band);
    const opener = rs.openerGroup === "EARLY" ? "ранней" : "поздней";
    const stack = rs.band === "LOW" ? "10-14 BB" : "14-25 BB";

    // Половина «при колле»: эквити руки Hero против диапазона продолжения опенера.
    const eq = preflopEquityVsRangeFast(snapshot.heroCards, continueCodes);
    if (eq) {
      lines.push(
        `Эквити ${rs.code} ПРИ КОЛЛЕ твоего рестила (${stack}, опенер с ${opener} позиции продолжает по чарту, ${eq.combosLive} комбо): ≈${eq.equityPct}%. Это только половина оценки пуша — вторая половина ниже (как часто он сбрасывает); слабое эквити при колле само по себе рестил не хоронит, коллируют узко.`,
      );
    }

    // Половина «фолд-эквити» (фаза 2): доля ОПЕН-диапазона опенера (по его точной
    // позиции, RFI-чарт), которая сбрасывается на твой олл-ин. Продолжение = его
    // диапазон колла ∩ его опен-диапазон; фолд = опен − продолжение. Обе доли — из
    // тех же Set, что грейдер и /charts, поэтому фолд-эквити согласовано с чартами.
    const openerSeat = snapshot.seats.find((s) => s.label === rs.openerLabel);
    const openerPos = openerSeat ? openChartPosition(openerSeat.position, openerSeat.positionName) : null;
    if (openerPos) {
      const openRange = rfiOpenRange(openerPos);
      const openCombos = combosOf(openRange);
      const continueInOpen = continueCodes.filter((c) => openRange.has(c));
      const continueCombos = combosOf(continueInOpen);
      if (openCombos > 0) {
        const foldPct = Math.round(((openCombos - continueCombos) / openCombos) * 100);
        const openPct = Math.round(percentOf(openRange));
        const contPct = Math.round(percentOf(continueInOpen));
        lines.push(
          `Фолд-эквити рестила по чартам: опен ${openerPos} ≈${openPct}% рук; из них против твоего олл-ина продолжает ≈${contPct}% → сбрасывает ≈${foldPct}% своего диапазона. Забранные без вскрытия блайнды с анте — эта доля и есть вторая половина прибыли пуша.`,
        );
      }
    }
  }

  // 3. Защита BB против одиночного опена (колл/3-бет). Эквити руки Hero при вскрытии
  //    против ВСЕГО опен-диапазона открывашки (RFI-чарт её позиции) — ориентир «впереди
  //    или позади его диапазона в целом», НЕ цена защиты: из BB реализация с руки хуже
  //    эквити при вскрытии (вне позиции, доплата — не гарантия дойти до шоудауна).
  const bb = detectHeroBBDefense(snapshot);
  if (bb && bb.action !== "FOLD") {
    const eq = preflopEquityVsRangeFast(snapshot.heroCards, [...rfiOpenRange(bb.openerPosition)]);
    if (eq) {
      lines.push(
        `Эквити ${bb.code} против всего опен-диапазона ${bb.openerPosition} (RFI-чарт, ${eq.combosLive} комбо): ≈${eq.equityPct}% при вскрытии. Это ориентир «впереди/позади его диапазона в целом», а НЕ цена защиты: из BB рука реализует эквити хуже (вне позиции, доплата — не гарантия дойти до вскрытия).`,
      );
    }
  }

  return lines;
}

import type { TableSnapshot } from "./types";
import { detectHeroBBDefense } from "./bb-defense";
import { detectHeroVsOpen } from "./vs-open";
import { detectHeroOpen } from "./open-raise";
import { detectHeroIso } from "./iso";
import { detectHeroOpenShove } from "./open-shove";
import { detectHeroResteal } from "./resteal";
import { detectHeroCallVsPush } from "./call-vs-push";
import { bbCellState, isBBThreeBetSignificantlyWide } from "@/config/poker/bb-defense-chart";
import { restealCellState } from "@/config/poker/resteal-chart";
import { callVsPushCellState } from "@/config/poker/call-vs-push-chart";
import { vsOpenCellState } from "@/config/poker/vs-open-chart";
import { rfiCellState, isOpenPosition } from "@/config/poker/rfi-chart";
import { isoCellState } from "@/config/poker/iso-chart";
import { pushCellState } from "@/config/poker/push-fold-chart";

// Вердикт эталонного префлоп-чарта для промпта тренера. Правило 1: попадание руки
// в чарт считает код — те же детекторы спотов и те же грейдеры, что страница /charts,
// «Твои чарты» и лик-детекторы, поэтому тренер и эталон разойтись не могут.
//
// Зачем: без этой строки модель судила префлоп «на глаз» и спорила с нашими же
// чартами — называла ошибкой стандартную защиту BB (QJo против опена BTN, 64s против
// CO) и дожимала игрока к «правильному фолду», которого нет. Теперь у тренера есть
// готовый вердикт, и выдумывать свой префлоп-диапазон ему запрещено.
//
// Возвращает null, если раздача не попала ни в один судимый спот (мультивей, 3-бет
// до Hero, блайнд-vs-блайнд, короткий стек вне зоны и т.п.) — в сомнении не судим.

export function preflopChartFact(snapshot: TableSnapshot): string | null {
  const verdict = spotVerdict(snapshot);
  if (!verdict) return null;
  return [
    `Вердикт префлоп-чарта (эталон продукта, тот же, что видит игрок на странице чартов): ${verdict}`,
    "Этот вердикт — источник правды по префлопу: не называй ошибкой действие, которое по чарту стандартно, не дожимай игрока к «правильному фолду» руки, которая в чарте, и не выдумывай свой префлоп-диапазон вместо чарта. Спорить с чартом можно только эксплойтом под конкретного оппонента — и тогда назови эту причину явно.",
  ].join("\n");
}

function spotVerdict(snapshot: TableSnapshot): string | null {
  const bb = detectHeroBBDefense(snapshot);
  if (bb) {
    const state = bbCellState(bb.openerPosition, bb.code);
    const spot = `защита BB с ${bb.code} против одиночного опена с ${bb.openerPosition}`;
    if (bb.action === "CALL") {
      if (state === "CALL") return `${spot}: колл — СТАНДАРТНАЯ защита, рука в чарте. Это не ошибка.`;
      if (state === "CALL_SOMETIMES")
        return `${spot}: колл — весовая (пограничная) клетка чарта: защищаться этой рукой можно, ошибкой это не считается.`;
      if (state === "THREEBET" || state === "THREEBET_BLUFF")
        return `${spot}: рука из 3-бет-части чарта — колл не ошибка, но эталон предпочитает 3-бет.`;
      return `${spot}: этой руки в чарте защиты нет — по эталону дефолт фолд.`;
    }
    if (bb.action === "3BET") {
      if (state === "THREEBET") return `${spot}: 3-бет на велью — в чарте.`;
      if (state === "THREEBET_BLUFF") return `${spot}: 3-бет весом (блеф-часть чарта) — нормальная линия.`;
      return isBBThreeBetSignificantlyWide(bb.openerPosition, bb.code)
        ? `${spot}: 3-бет ЗАМЕТНО ШИРЕ нормы чарта — по эталону этой рукой не 3-бетят.`
        : `${spot}: 3-бет на границе допуска чарта — не ошибка, но и не рекомендация.`;
    }
    // FOLD: подсказываем эталон, но фолд из BB не клеймим ошибкой — решение с нюансами
    if (state === "CALL" || state === "CALL_SOMETIMES")
      return `${spot}: по чарту эта рука обычно ЗАЩИЩАЕТСЯ коллом — фолд тайтовее эталона.`;
    if (state === "THREEBET" || state === "THREEBET_BLUFF")
      return `${spot}: по чарту эта рука играется 3-бетом — фолд заметно тайтовее эталона.`;
    return `${spot}: фолд — по чарту, этой руки в защите нет.`;
  }

  // Рестил (3-бет-олл-ин 10–20bb против одиночного опена) — чарт собран из публичных
  // равновесий (ICMIZER/Upswing/Nash, среднее; см. config/poker/resteal-chart.ts).
  const rs = detectHeroResteal(snapshot);
  if (rs) {
    const state = restealCellState(rs.openerGroup, rs.band, rs.code);
    const opener = rs.openerGroup === "EARLY" ? "ранней позиции" : "поздней позиции";
    const stack = rs.band === "LOW" ? "10-14 BB" : "14-20 BB";
    const spot = `рестил (3-бет-олл-ин) ${rs.code} на стеке ${stack} против опена с ${opener}`;
    if (state === "JAM") return `${spot}: в чарте — СТАНДАРТНЫЙ рестил, это не ошибка.`;
    if (state === "JAM_WEIGHT")
      return `${spot}: весовая клетка чарта — джемить можно, ошибкой это не считается (в нокаут-турнире против охотников за головой чуть тайтовее).`;
    if (state === "BORDER") return `${spot}: граница допуска чарта — не ошибка, но и не рекомендация.`;
    return `${spot}: ВНЕ чарта рестила — по эталону этой рукой не джемят.`;
  }

  // Колл против опен-олл-ина короткого (≤14bb) — чарт от утверждённого колла BB
  // против пуша + публичные Nash-таблицы (см. config/poker/call-vs-push-chart.ts).
  const cvp = detectHeroCallVsPush(snapshot);
  if (cvp) {
    const state = callVsPushCellState(cvp.pusherGroup, cvp.pusherBand, cvp.code);
    const pos = cvp.pusherGroup === "EARLY" ? "ранней позиции" : "поздней позиции";
    const stack = cvp.pusherBand === "SHORT" ? "до 10 BB" : "10-14 BB";
    const spot = `колл ${cvp.code} против опен-олл-ина ${stack} с ${pos}`;
    if (cvp.action === "CALL") {
      if (state === "CALL")
        return `${spot}: в чарте — СТАНДАРТНЫЙ колл, это не ошибка (живые стеки позади делают колл лишь чуть тайтовее — сам по себе он верный).`;
      if (state === "BORDER") return `${spot}: граница допуска чарта — не ошибка, но и не рекомендация.`;
      return `${spot}: ВНЕ чарта — по эталону против этого пуша такую руку сбрасывают.`;
    }
    // FOLD: подсказываем эталон, фолд не клеймим (за спиной могли быть живые стеки)
    if (state === "CALL") return `${spot.replace("колл", "фолд")}: по чарту эта рука обычно КОЛЛИРУЕТ пуш — фолд тайтовее эталона.`;
    return `${spot.replace("колл", "фолд")}: фолд — по чарту.`;
  }

  const vo = detectHeroVsOpen(snapshot);
  if (vo) {
    const spot = `против одиночного опена: ${vo.code} на ${vo.heroPosition}`;
    if (vo.action === "3BET") {
      const state = vsOpenCellState(vo.heroPosition, vo.code);
      if (state === "THREEBET") return `${spot}: 3-бет на велью — в чарте.`;
      if (state === "THREEBET_BLUFF") return `${spot}: 3-бет весом (блеф-часть чарта) — нормальная линия.`;
      if (state === "BORDER") return `${spot}: 3-бет на границе допуска чарта — не ошибка, но и не рекомендация.`;
      return `${spot}: 3-бет вне чарта — по эталону этой рукой не 3-бетят.`;
    }
    if (vo.action === "CALL")
      return `${spot}: холодный колл эталонным чартом сознательно НЕ судится (спот нюансный — глубина, тип оппонента, игроки за спиной). Не выдумывай вердикт чарта, оценивай по обстоятельствам раздачи.`;
    return null; // фолд против опена вне BB — дефолт, не комментируем
  }

  const open = detectHeroOpen(snapshot);
  if (open && isOpenPosition(open.position)) {
    const state = rfiCellState(open.position, open.code);
    const spot = `открытие (RFI) ${open.code} с ${open.position}`;
    if (state === "ALWAYS") return `${spot}: в чарте — стандартное открытие. Это не ошибка.`;
    if (state === "SOMETIMES") return `${spot}: весовая клетка чарта — открывать можно по ситуации, ошибкой не считается.`;
    if (state === "BORDER") return `${spot}: граница допуска чарта — не ошибка, но и не рекомендация.`;
    return `${spot}: ВНЕ чарта открытий — шире нормы для этой позиции.`;
  }

  const iso = detectHeroIso(snapshot);
  if (iso) {
    const state = isoCellState(iso.heroPosition, iso.code);
    const spot = `изоляция лимпера: ${iso.code} с ${iso.heroPosition}`;
    if (state === "ISO") return `${spot}: в чарте — изолировать рейзом правильно.`;
    if (state === "OVERLIMP") return `${spot}: мелкая пара — эталон предпочитает оверлимп, изоляция рейзом флагается.`;
    if (state === "BORDER") return `${spot}: граница допуска чарта — не ошибка, но и не рекомендация.`;
    return `${spot}: ВНЕ чарта изоляции — шире нормы.`;
  }

  const push = detectHeroOpenShove(snapshot);
  if (push) {
    const state = pushCellState(push.band, push.position, push.code);
    const band = push.band === "SHORT" ? "до 10 BB" : "10-14 BB";
    const spot = `опен-шов ${push.code} с ${push.position} на стеке ${band}`;
    if (state === "ALWAYS") return `${spot}: в Nash-диапазоне — дисциплинированный пуш.`;
    if (state === "BORDER") return `${spot}: граница допуска Nash-диапазона — не ошибка, но и не рекомендация.`;
    return `${spot}: ВНЕ Nash-диапазона — по эталону этой рукой не пушат.`;
  }

  return null;
}

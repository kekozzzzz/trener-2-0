import type { TableSnapshot } from "./types";
import { detectHeroBBDefense } from "./bb-defense";
import { detectHeroVsOpen } from "./vs-open";
import { detectHeroOpen } from "./open-raise";
import { detectHeroIso } from "./iso";
import { detectHeroOpenShove } from "./open-shove";
import { detectHeroResteal } from "./resteal";
import { detectHeroCallVsPush } from "./call-vs-push";
import { detectHeroDefVs3bet } from "./def-vs-3bet";
import { detectHeroBvbDefense } from "./bvb-defense";
import { bvbCellState, isBvbThreeBetSignificantlyWide } from "@/config/poker/bvb-chart";
import { detectHeroSqueeze } from "./squeeze";
import { detectHeroSbLimp } from "./sb-limp";
import { detectHeroLimp } from "./limp";
import { detectHeroCallVsResteal } from "./call-vs-resteal";
import { callVsRestealCellState } from "@/config/poker/call-vs-resteal-chart";
import { fourBetCellState } from "@/config/poker/def-vs-3bet-chart";
import { isSqueezeSignificantlyWide } from "@/config/poker/squeeze-chart";
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

  // Блайнд-против-блайнда: BB против одиночного опен-рейза SB (самая широкая защита
  // в игре — SB открывает ~40%; чарт из публичных источников, см. bvb-chart.ts).
  const bvb = detectHeroBvbDefense(snapshot);
  if (bvb) {
    const state = bvbCellState(bvb.code);
    const spot = `блайнд-против-блайнда: ${bvb.code} на BB против опен-рейза SB`;
    if (bvb.action === "CALL") {
      if (state === "CALL") return `${spot}: колл — СТАНДАРТНАЯ защита (против SB защищаются шире, чем против любой позиции). Это не ошибка.`;
      if (state === "CALL_SOMETIMES") return `${spot}: весовая (пограничная) клетка чарта — защищаться можно, ошибкой не считается.`;
      if (state === "THREEBET" || state === "THREEBET_BLUFF")
        return `${spot}: рука из 3-бет-части чарта — колл не ошибка, но эталон предпочитает 3-бет (SB часто открывает слабее и сдаётся).`;
      return `${spot}: этой руки даже в широченной BvB-защите нет — по эталону дефолт фолд.`;
    }
    if (bvb.action === "3BET") {
      if (state === "THREEBET") return `${spot}: 3-бет на велью — в чарте.`;
      if (state === "THREEBET_BLUFF") return `${spot}: 3-бет весом (блеф-часть чарта) — нормальная линия против широкого SB-опена.`;
      return isBvbThreeBetSignificantlyWide(bvb.code)
        ? `${spot}: 3-бет заметно шире нормы чарта.`
        : `${spot}: 3-бет на границе допуска чарта — не ошибка, но и не рекомендация.`;
    }
    if (state === "CALL" || state === "CALL_SOMETIMES")
      return `${spot}: по чарту эта рука обычно ЗАЩИЩАЕТСЯ — фолд против широкого SB-опена тайтовее эталона.`;
    if (state === "THREEBET" || state === "THREEBET_BLUFF")
      return `${spot}: по чарту эта рука играется 3-бетом — фолд заметно тайтовее эталона.`;
    return `${spot}: фолд — по чарту.`;
  }

  // Рестил (3-бет-олл-ин 10–25bb против одиночного опена) — чарт собран из публичных
  // равновесий (ICMIZER/Upswing/Nash, среднее; см. config/poker/resteal-chart.ts).
  const rs = detectHeroResteal(snapshot);
  if (rs) {
    const state = restealCellState(rs.openerGroup, rs.band, rs.code);
    const opener = rs.openerGroup === "EARLY" ? "ранней позиции" : "поздней позиции";
    const stack = rs.band === "LOW" ? "10-14 BB" : "14-25 BB";
    const spot = `рестил (3-бет-олл-ин) ${rs.code} на стеке ${stack} против опена с ${opener}`;
    if (state === "JAM") return `${spot}: в чарте — СТАНДАРТНЫЙ рестил, это не ошибка.`;
    if (state === "JAM_WEIGHT")
      return `${spot}: весовая клетка чарта — пушить можно, ошибкой это не считается (в нокаут-турнире против охотников за головой чуть тайтовее).`;
    if (state === "BORDER") return `${spot}: граница допуска чарта — не ошибка, но и не рекомендация.`;
    return `${spot}: ВНЕ чарта рестила — по эталону этой рукой олл-ин не ставят.`;
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

  // Колл против рестила (мы открылись → в нас 3-бет-олл-ин 10-25bb): зеркало
  // рестил-чарта, тот же источник данных (см. call-vs-resteal-chart.ts).
  const cvr = detectHeroCallVsResteal(snapshot);
  if (cvr) {
    const state = callVsRestealCellState(cvr.openerGroup, cvr.jamBand, cvr.code);
    const our = cvr.openerGroup === "EARLY" ? "ранней" : "поздней";
    const stack = cvr.jamBand === "LOW" ? "10-14 BB" : "14-25 BB";
    const spot = `колл ${cvr.code} против 3-бет-олл-ина ${stack} (ты открывался с ${our} позиции)`;
    if (cvr.action === "CALL") {
      if (state === "CALL") return `${spot}: в чарте — стандартный колл (против твоего опена с ${our} позиции пушат ${cvr.openerGroup === "LATE" ? "широко" : "узко и сильно"}).`;
      if (state === "BORDER") return `${spot}: граница допуска чарта — не ошибка, но и не рекомендация.`;
      return `${spot}: ВНЕ чарта — по эталону против этого олл-ина такую руку сбрасывают (опен-и-фолд здесь нормален, вложенные 2 BB не жалей).`;
    }
    if (state === "CALL") return `${spot.replace("колл", "фолд")}: по чарту эта рука обычно КОЛЛИРУЕТ олл-ин — фолд тайтовее эталона.`;
    return `${spot.replace("колл", "фолд")}: фолд — по чарту, опен-и-фолд против олл-ина нормален.`;
  }

  // Защита против 3-бета (мы открылись → в нас 3-бетнули): 4-бет судится чартом,
  // колл сознательно не грейдится (вопрос глубины — мёртвые имплайды на коротком).
  const def = detectHeroDefVs3bet(snapshot);
  if (def) {
    const spot = `защита против 3-бета: ${def.code}, ты открывался с ${def.heroPosition}`;
    if (def.action === "4BET") {
      const state = fourBetCellState(def.heroPosition, def.code);
      if (state === "FOURBET") return `${spot}: 4-бет на велью — в чарте.`;
      if (state === "BLUFF") return `${spot}: 4-бет блокером весом (блеф-часть чарта) — нормальная линия.`;
      if (state === "BORDER") return `${spot}: 4-бет на границе допуска чарта — не ошибка, но и не рекомендация.`;
      return `${spot}: 4-бет ВНЕ чарта — по эталону этой рукой не 4-бетят.`;
    }
    if (def.action === "CALL")
      return `${spot}: колл 3-бета эталонным чартом сознательно НЕ судится — реши через ГЛУБИНУ (остаток 3-беттора, имплайд-оддсы; см. фреймворк), не через доминацию.`;
    return null; // фолд на 3-бет — дефолт, не комментируем
  }

  // Сквиз (3-бет поверх опена + коллера): ширина сильно спот-зависима, жёстко судится
  // только заведомый мусор (низкий офсьют без туза — не сквиз ниоткуда).
  const sq = detectHeroSqueeze(snapshot);
  if (sq) {
    const spot = `сквиз ${sq.code} с ${sq.heroPosition} (3-бет поверх опена и коллера)`;
    return isSqueezeSignificantlyWide(sq.heroPosition, sq.code)
      ? `${spot}: ЗАВЕДОМО мусорная рука для сквиза — по эталону так не сквизят ни из какой позиции.`
      : `${spot}: в пределах допустимого — ширина сквиза сильно зависит от спота (из блайндов против позднего опена сквизуют широко), жёсткого вердикта чарт не даёт; оцени велью-составляющую и фолд-эквити по обстоятельствам.`;
  }

  // SB-лимп при фолде до Hero — по эталону продукта НЕ утечка (дёшево смотрим флоп,
  // сильной рукой рейзим): страхуем тренера от старого рефлекса «лимп = ошибка».
  const sbLimp = detectHeroSbLimp(snapshot);
  if (sbLimp) {
    return `SB-лимп ${sbLimp} при фолде до тебя: по эталону это НЕ утечка — дешёвый комплит против одного BB нормален (сильной рукой тут рейзят 3-3.5bb). Не называй сам лимп ошибкой; смотри розыгрыш постфлопа.`;
  }

  // Лимп Hero (кроме SB-комплита — его детектор лимпа сам исключает): открытие лимпом —
  // утечка по эталону; долимп за лимпером — слабее изоляции, кроме мелкой пары.
  const limp = detectHeroLimp(snapshot);
  if (limp) {
    if (limp.kind === "OPEN")
      return `открытие ЛИМПОМ ${limp.code} с ${limp.position}: по эталону это утечка — банк открывают рейзом или сбрасывают; лимп не забирает инициативу и зовёт весь стол.`;
    // SB-долимп за лимпером — дешёвый комплит из малого блайнда (полблайнда уже вложено,
    // цена мала). Зеркалит «SB-лимп при фолде до Hero не утечка»: клеймить долимп из SB
    // утечкой — тот же анти-нит перекос (разбор коуча 2026-07-12, K6o с SB за лимпером).
    if (limp.position === "SB")
      return `долимп ${limp.code} с малого блайнда за лимпером: по эталону это НЕ утечка — дешёвый комплит из SB (полблайнда уже вложено, цена мала). Сильной рукой отсюда изолируют рейзом, но сам долимп ошибкой не считается; смотри розыгрыш постфлопа.`;
    const smallPair = limp.code.length === 2 && limp.code[0] === limp.code[1];
    return smallPair
      ? `долимп ${limp.code} за лимпером: мелкой карманной парой оверлимп нормален (дешёвый сет-майнинг) — не ошибка.`
      : `долимп ${limp.code} за лимпером с ${limp.position}: по эталону слабее изоляции рейзом или фолда — чем больше лимперов, тем реже рука выигрывает банк.`;
  }

  const open = detectHeroOpen(snapshot);
  if (open && isOpenPosition(open.position)) {
    const state = rfiCellState(open.position, open.code);
    const spot = `открытие (RFI) ${open.code} с ${open.position}`;
    if (state === "ALWAYS") return `${spot}: в чарте — стандартное открытие. Это не ошибка.`;
    if (state === "SOMETIMES") return `${spot}: весовая клетка чарта — открывать можно по ситуации, ошибкой не считается.`;
    if (state === "BORDER") return `${spot}: граница допуска чарта — не ошибка, но и не рекомендация.`;
    // SB вне рейз-ренжа — НЕ «слишком широкое открытие»: слабые руки с малого блайнда
    // лимпят (SB-лимп не утечка), а не фолдят. Не клеймить широту, дать лимп-альтернативу
    // (разбор коуча 2026-07-12, K5o с SB названо утечкой — тот же анти-нит перекос).
    if (open.position === "SB")
      return `${spot}: вне SB рейз-ренжа эталона — но это НЕ утечка сама по себе: слабые руки с малого блайнда ЛИМПЯТ (SB-лимп не утечка), а не фолдят. Оцени как выбор рейз-vs-лимп, не клейми «слишком широким открытием» и жёстким вердиктом эту клетку не суди.`;
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

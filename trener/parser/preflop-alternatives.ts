import type { Position, TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { detectHeroLimp } from "./limp";
import { detectHeroSbLimp } from "./sb-limp";
import { detectHeroVsOpen } from "./vs-open";
import { detectHeroDefVs3bet } from "./def-vs-3bet";
import { handCode } from "@/config/poker/hand-codes";
import { rfiCellState, openChartPosition, isOpenPosition, OPEN_MIN_STACK_BB } from "@/config/poker/rfi-chart";
import { vsOpenCellState } from "@/config/poker/vs-open-chart";
import { fourBetCellState } from "@/config/poker/def-vs-3bet-chart";
import {
  restealCellState,
  restealBandFor,
  restealOpenerGroup,
  type RestealBand,
  type RestealOpenerGroup,
} from "@/config/poker/resteal-chart";
import { pushCellState, pushPosition, stackBandFor, type PushPosition, type StackBand } from "@/config/poker/push-fold-chart";

// Префлоп-альтернативы: парсер прогоняет СУЩЕСТВУЮЩИЕ чарт-грейдеры для ветки, которую
// Hero НЕ выбрал («ты залимпил, а по чарту это стандартное открытие рейзом»; «перед
// тобой открылись - была ветка 3-бет / рестил-джем»). Правило 1: чарт считает код (те
// же грейдеры, что /charts и preflop-chart-fact), не LLM. Граница: показываем ФАКТ
// членства в чарте, НЕ вердикт «так лучше» и НЕ EV (солвер сознательно не ставим).
//
// Два семейства спотов, взаимоисключающие для одной раздачи:
//   - Hero ПЕРВЫЙ в игру: лимп→рейз/фолд, SB-лимп→рейз, фолд премиума→упущенный вход,
//     короткий стек (<15bb) мин-рейз/лимп/фолд→джем по Nash;
//   - Перед Hero ОДИН опен: 3-бет-джем (рестил 10-25bb) или глубокий 3-бет велью.
// В боевой промпт НЕ вплетено - гейтованный шаг. См. план 2026-07-09.

export type PreflopAltAction = "OPEN_RAISE" | "FOLD" | "SB_RAISE" | "THREE_BET" | "THREE_BET_JAM" | "JAM" | "FOUR_BET";

export type PreflopAlt = {
  actualAction: string; // что Hero сыграл (человекочитаемо)
  altAction: PreflopAltAction; // непройденная ветка
  code: string;
  chartPosition: string; // позиция чарта / группа опенера
  chartState: string; // вердикт грейдера для руки (якорь, не вердикт)
  rationale: string;
};

// Hero сбросил ПЕРВЫМ в игру (никто не входил до него) — для «упущенного входа».
function foldedFirstIn(snapshot: TableSnapshot): { position: Position; positionName?: string; code: string } | null {
  const hero = snapshot.seats.find((s) => s.label === "Hero");
  const bb = bigBlindFromSnapshot(snapshot);
  if (!hero || !bb || hero.startingStack / bb < OPEN_MIN_STACK_BB) return null;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break;
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;
    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue;
      return null;
    }
    if (a.action !== "FOLD") return null;
    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    return { position: hero.position, positionName: hero.positionName, code };
  }
  return null;
}

// Контекст «Hero на 10-25bb перед ОДНИМ опеном» — для оценки НЕсделанного рестил-джема.
// Как detectHeroResteal, но без требования, что Hero пошёл олл-ин (нам нужны колл/фолд).
function restealContext(
  snapshot: TableSnapshot,
): { openerGroup: RestealOpenerGroup; band: RestealBand; code: string; heroAction: string } | null {
  const hero = snapshot.seats.find((s) => s.label === "Hero");
  const bb = bigBlindFromSnapshot(snapshot);
  if (!hero || !bb) return null;
  const band = restealBandFor(hero.startingStack / bb);
  if (!band) return null;

  let raiser: string | null = null;
  let raiseCount = 0;
  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break;
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;
    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue;
      if (a.action === "RAISE") {
        raiseCount += 1;
        if (raiseCount > 1) return null;
        raiser = a.actor;
        continue;
      }
      return null;
    }
    if (raiseCount !== 1 || !raiser) return null;
    const raiserSeat = snapshot.seats.find((s) => s.label === raiser);
    if (!raiserSeat) return null;
    const openerPos = openChartPosition(raiserSeat.position, raiserSeat.positionName);
    if (!openerPos) return null;
    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    return { openerGroup: restealOpenerGroup(openerPos), band, code, heroAction: a.action };
  }
  return null;
}

// Контекст «короткий стек (<15bb) ПЕРВЫЙ в игру, но НЕ пушнул» — для НЕсделанного джема.
// Как detectHeroOpenShove, но ловит мин-рейз/лимп/фолд вместо олл-ина.
function shortFirstInContext(
  snapshot: TableSnapshot,
): { position: PushPosition; band: StackBand; code: string; heroAction: string } | null {
  const hero = snapshot.seats.find((s) => s.label === "Hero");
  const bb = bigBlindFromSnapshot(snapshot);
  if (!hero || !bb) return null;
  const band = stackBandFor(hero.startingStack / bb);
  if (!band) return null; // ≥15bb — не пуш-фолд-зона

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break;
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;
    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue;
      return null; // кто-то вошёл до Hero → не «первым в банк»
    }
    if (a.action === "ALL_IN") return null; // уже пушнул — альтернативы нет
    if (a.action !== "RAISE" && a.action !== "CALL" && a.action !== "FOLD") return null;
    const position = pushPosition(hero.position, hero.positionName);
    if (!position) return null;
    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    return { position, band, code, heroAction: a.action };
  }
  return null;
}

export function preflopAlternatives(snapshot: TableSnapshot): PreflopAlt | null {
  const hero = snapshot.seats.find((s) => s.label === "Hero");
  const bb = bigBlindFromSnapshot(snapshot);
  const effBb = hero && bb ? hero.startingStack / bb : null;

  // ── ПЕРЕД HERO ОДИН ОПЕН: 3-бет-джем (10-25bb) или глубокий 3-бет ──

  // 3-бет-джем (рестил 10-25bb): Hero заколлировал/сбросил, а джем - в чарте рестила.
  const rc = restealContext(snapshot);
  if (rc && (rc.heroAction === "CALL" || rc.heroAction === "FOLD")) {
    const state = restealCellState(rc.openerGroup, rc.band, rc.code);
    if (state === "JAM" || state === "JAM_WEIGHT") {
      const opener = rc.openerGroup === "EARLY" ? "ранней" : "поздней";
      const played = rc.heroAction === "CALL" ? "холодный колл" : "фолд";
      return {
        actualAction: rc.heroAction === "CALL" ? "COLD_CALL_VS_OPEN" : "FOLD_VS_OPEN",
        altAction: "THREE_BET_JAM",
        code: rc.code,
        chartPosition: rc.openerGroup,
        chartState: state,
        rationale: `${rc.code} на ${rc.band === "LOW" ? "10-14bb" : "14-25bb"} против опена с ${opener} позиции - в чарте рестила: вместо ${played} была ветка 3-бет-ОЛЛ-ИН (на этой глубине обычный 3-бет коммитит, поэтому джем)`,
      };
    }
  }

  // Глубокий 3-бет велью (>25bb, вне рестил-зоны): Hero заколлировал/сбросил велью-руку.
  if (effBb !== null && restealBandFor(effBb) === null) {
    const vo = detectHeroVsOpen(snapshot);
    if (vo && (vo.action === "CALL" || vo.action === "FOLD")) {
      const state = vsOpenCellState(vo.heroPosition, vo.code);
      if (state === "THREEBET") {
        const played = vo.action === "CALL" ? "холодный колл" : "фолд";
        return {
          actualAction: vo.action === "CALL" ? "COLD_CALL_VS_OPEN" : "FOLD_VS_OPEN",
          altAction: "THREE_BET",
          code: vo.code,
          chartPosition: vo.heroPosition,
          chartState: state,
          rationale: `${vo.code} с ${vo.heroPosition} против опена - в велью-части 3-бет-чарта: вместо ${played} была ветка 3-БЕТ (премиум играют 3-бетом, флэт недобирает)`,
        };
      }
    }
  }

  // 4-бет велью: Hero открылся, в него пришёл 3-бет, а он заколлировал/сбросил велью-руку.
  // Только FOURBET (велью) — 4-бет-блеф блокером проактивно не подсказываем (спью-риск).
  const def = detectHeroDefVs3bet(snapshot);
  if (def && (def.action === "CALL" || def.action === "FOLD")) {
    const state = fourBetCellState(def.heroPosition, def.code);
    if (state === "FOURBET") {
      const played = def.action === "CALL" ? "колл 3-бета" : "фолд на 3-бет";
      return {
        actualAction: def.action === "CALL" ? "CALL_VS_3BET" : "FOLD_VS_3BET",
        altAction: "FOUR_BET",
        code: def.code,
        chartPosition: def.heroPosition,
        chartState: state,
        rationale: `${def.code} с ${def.heroPosition} - в велью-части 4-бет-чарта: вместо ${played} была ветка 4-БЕТ (эту руку играют 4-бетом на велью)`,
      };
    }
  }

  // ── HERO ПЕРВЫЙ В ИГРУ ──

  // Открытие ЛИМПОМ (не-SB): в чарте → рейз; вне чарта → фолд.
  const limp = detectHeroLimp(snapshot);
  if (limp && limp.kind === "OPEN") {
    const pos = hero ? openChartPosition(hero.position, hero.positionName) : null;
    if (pos && isOpenPosition(pos)) {
      const state = rfiCellState(pos, limp.code);
      if (state === "ALWAYS" || state === "SOMETIMES") {
        const std = state === "ALWAYS" ? "стандартное открытие" : "весовая рука для открытия";
        return {
          actualAction: "OPEN_LIMP",
          altAction: "OPEN_RAISE",
          code: limp.code,
          chartPosition: pos,
          chartState: state,
          rationale: `${limp.code} с ${pos} - по RFI-чарту ${std}: вместо лимпа была ветка открыть РЕЙЗОМ (лимп не берёт инициативу и зовёт весь стол)`,
        };
      }
      if (state === "OUT") {
        return {
          actualAction: "OPEN_LIMP",
          altAction: "FOLD",
          code: limp.code,
          chartPosition: pos,
          chartState: state,
          rationale: `${limp.code} с ${pos} - ВНЕ RFI-чарта: вместо лимпа мусором была ветка ФОЛД`,
        };
      }
    }
  }

  // SB-лимп сильной рукой (ядро чарта) → рейз 3-3.5bb. Слабый SB-лимп не трогаем.
  const sbLimp = detectHeroSbLimp(snapshot);
  if (sbLimp) {
    const state = rfiCellState("SB", sbLimp);
    if (state === "ALWAYS") {
      return {
        actualAction: "SB_LIMP",
        altAction: "SB_RAISE",
        code: sbLimp,
        chartPosition: "SB",
        chartState: state,
        rationale: `${sbLimp} на SB - в рейз-части SB-чарта: сильной рукой тут была ветка РЕЙЗ 3-3.5bb, а не лимп (лимп ок только слабым низом)`,
      };
    }
  }

  // Короткий стек (<15bb) первым в игру, но НЕ пушнул: джем по Nash (только ALWAYS).
  const sc = shortFirstInContext(snapshot);
  if (sc) {
    const state = pushCellState(sc.band, sc.position, sc.code);
    if (state === "ALWAYS") {
      const played = sc.heroAction === "RAISE" ? "мин-рейз" : sc.heroAction === "CALL" ? "лимп" : "фолд";
      return {
        actualAction: `SHORT_${sc.heroAction}`,
        altAction: "JAM",
        code: sc.code,
        chartPosition: sc.position,
        chartState: state,
        rationale: `${sc.code} с ${sc.position} на коротком стеке - в Nash-пуш-диапазоне: вместо ${played} была ветка ДЖЕМ (на такой глубине джем-или-фолд, мин-рейз/лимп коммитит без фолд-эквити)`,
      };
    }
  }

  // Фолд ПЕРВЫМ в игру (глубоко): упущенный вход - только безусловно-стандартные руки.
  const folded = foldedFirstIn(snapshot);
  if (folded) {
    const pos = openChartPosition(folded.position, folded.positionName);
    if (pos && isOpenPosition(pos)) {
      const state = rfiCellState(pos, folded.code);
      if (state === "ALWAYS") {
        return {
          actualAction: "FOLD_FIRST_IN",
          altAction: "OPEN_RAISE",
          code: folded.code,
          chartPosition: pos,
          chartState: state,
          rationale: `${folded.code} с ${pos} - по RFI-чарту стандартное открытие, а ты сбросил первым в игру: возможен упущенный вход (сверь с ICM/динамикой стола)`,
        };
      }
    }
  }

  return null;
}

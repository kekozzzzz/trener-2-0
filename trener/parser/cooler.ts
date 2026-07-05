import type { Street, TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { equityVsHand } from "./lucky-win";
import { detectHeroOpen } from "./open-raise";
import { detectHeroBBDefense } from "./bb-defense";
import { detectHeroIso } from "./iso";
import { detectHeroOpenShove } from "./open-shove";
import { detectHeroVsOpen } from "./vs-open";
import { detectHeroLimp } from "./limp";
import { isOpenSignificantlyWide } from "@/config/poker/rfi-chart";
import { isBBThreeBetSignificantlyWide } from "@/config/poker/bb-defense-chart";
import { isVsOpenThreeBetSignificantlyWide } from "@/config/poker/vs-open-chart";
import { isIsoSignificantlyWide } from "@/config/poker/iso-chart";
import { isOpenShoveSignificantlyWide } from "@/config/poker/push-fold-chart";

// Детектор КУЛЕРА (план 2026-07-05-кулеры-и-перезаходы): Hero проиграл раздачу, но в
// момент своего последнего крупного вложения был ДАЛЕКО ВПЕРЕДИ показанной на вскрытии
// руки соперника — «сыграл правильно, соперник доехал». Зеркало детектора доезда
// (lucky-win.ts): тот же честный перебор эквити по вскрытым картам, те же пороги
// существенности вложения. Такие раздачи НЕ идут в критические с диалогом — им нечего
// разбирать; они уходят в тихую стопку «Кулеры» с детерминированной подписью парсера.
//
// Правило 1: карты соперника даёт парсер (вскрытие из HH), эквити — перебор. LLM тут
// не участвует вообще.

// «Далеко впереди»: 67%+ даже против ХУДШЕЙ для Hero вскрытой руки — зеркало порога
// доезда (соперник ехал с <33%). Флипы и стандартные доминации сюда не попадают —
// в сомнении раздача остаётся кандидатом в критические, там разберёт тренер.
const COOLER_EQUITY_MIN = 67;

// Существенное вложение — те же пороги, что у детектора доезда (lucky-win.ts).
const SIGNIFICANT_BB = 5;
const SIGNIFICANT_STACK_SHARE = 0.1;

const CONTINUE_ACTIONS = new Set(["CALL", "RAISE", "ALL_IN", "BET"]);
const STREET_BOARD_LEN: Record<Street, number> = { PREFLOP: 0, FLOP: 3, TURN: 4, RIVER: 5 };

export type CoolerLoss = {
  street: Street; // улица последнего крупного вложения, где Hero был впереди
  equityPct: number; // его эквити в тот момент против худшей из вскрытых рук
};

// «Чистый префлоп»: ни один эталонный грейдер не флагнул вход Hero и он не лимпил
// открытием. Грязный префлоп (мусорный вход, изоляция/пуш шире нормы) — раздача НЕ
// кулер: доезд доездом, а вход разобрать стоит, пусть остаётся кандидатом в CRITICAL.
export function hasCleanPreflop(snapshot: TableSnapshot): boolean {
  if (detectHeroLimp(snapshot)) return false;

  const open = detectHeroOpen(snapshot);
  if (open && isOpenSignificantlyWide(open.position, open.code)) return false;

  const bb = detectHeroBBDefense(snapshot);
  if (bb && bb.action === "3BET" && isBBThreeBetSignificantlyWide(bb.openerPosition, bb.code)) return false;

  const vo = detectHeroVsOpen(snapshot);
  if (vo && vo.action === "3BET" && isVsOpenThreeBetSignificantlyWide(vo.heroPosition, vo.code)) return false;

  const iso = detectHeroIso(snapshot);
  if (iso && isIsoSignificantlyWide(iso.heroPosition, iso.code)) return false;

  const shove = detectHeroOpenShove(snapshot);
  if (shove && isOpenShoveSignificantlyWide(shove.band, shove.position, shove.code)) return false;

  return true;
}

// Кулер: Hero крупно вложился постфлоп, будучи ≥67% против КАЖДОЙ вскрытой руки, — и
// проиграл (потерю фишек проверяет вызывающий). Префлоп-точность (олл-ин до флопа,
// AA против KK) сознательно не считаем — как и у детектора доезда, перебор двух+ карт
// борда с префлопа дорог; постфлоп покрывает подавляющую часть реальных кулеров.
export function detectHeroCooler(snapshot: TableSnapshot): CoolerLoss | null {
  const hero = snapshot.heroCards;
  if (!hero || hero.length !== 2) return null;
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb) return null;
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat) return null;

  const shown = snapshot.seats.filter((s) => s.label !== "Hero" && s.shownCards?.length === 2);
  if (shown.length === 0) return null;

  const minAmount = Math.max(SIGNIFICANT_BB * bb, heroSeat.startingStack * SIGNIFICANT_STACK_SHARE);

  // Последнее существенное добровольное вложение Hero на постфлопе — самая поздняя
  // точка, где он ещё решал; борд на тот момент известен по улице действия.
  let decision: { street: Street; boardLen: number } | null = null;
  for (const a of snapshot.actions) {
    if (a.actor !== "Hero" || a.street === "PREFLOP") continue;
    if (!CONTINUE_ACTIONS.has(a.action)) continue;
    if ((a.amount ?? 0) < minAmount) continue;
    decision = { street: a.street, boardLen: STREET_BOARD_LEN[a.street] };
  }
  if (!decision) return null;

  const boardThen = snapshot.board.slice(0, decision.boardLen);
  if (boardThen.length !== decision.boardLen) return null;

  // Против нескольких вскрытых рук берём худший для Hero случай (минимум эквити):
  // кулер — только когда впереди ВСЕХ, кто вскрылся.
  let minEquity: number | null = null;
  for (const seat of shown) {
    const eq = equityVsHand(hero, seat.shownCards!, boardThen);
    if (eq === null) continue;
    if (minEquity === null || eq < minEquity) minEquity = eq;
  }
  if (minEquity === null || minEquity < COOLER_EQUITY_MIN) return null;

  if (!hasCleanPreflop(snapshot)) return null;

  return { street: decision.street, equityPct: minEquity };
}

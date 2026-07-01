import type { TableSnapshot } from "./types";
import {
  OPP_MIN_HANDS,
  OPP_SOLID_HANDS,
  OPP_VPIP_LOOSE,
  OPP_VPIP_TIGHT,
  OPP_GAP_PASSIVE,
  OPP_GAP_AGGRO,
} from "@/config/poker/opponent";

// Детерминированный профиль оппонента — внутренний ПРИОР для тренера (чем рыбнее, тем
// шире диапазон). Правило 1: частоты и тип считает код, не LLM. НЕ показываем игроку
// (иначе HUD). Тип — мягкий приор снимок-во-времени (человек меняет передачи), не приговор.
//
// Оппонента склеиваем через раздачи по opponentToken (обезличенный per-турнир псевдоним
// "oppN" — присваивает парсер, сырой ник не хранится). Действия в снимке — по МЕТКЕ ("Player N"),
// поэтому в каждой раздаче резолвим токен → место → его метка. Считаем ТОЛЬКО по действиям
// (VPIP/PFR/лимп) — карт оппонента на вскрытии в снимке нет.

export type OpponentType = "UNKNOWN" | "FISH" | "LAG" | "NIT" | "REG";

export type OpponentProfile = {
  handsObserved: number;
  vpip: number; // %
  pfr: number; // %
  limpRate: number; // %
  type: OpponentType;
  confidence: "none" | "tentative" | "solid";
};

// Факт для тренера: профиль злодея ТЕКУЩЕЙ раздачи под его меткой "Player N" (токен
// наружу не отдаём). Только определённые типы (UNKNOWN отсеиваем — «нет ридса»).
export type OpponentFact = {
  seatLabel: string; // "Player <место>" из текущей раздачи
  type: Exclude<OpponentType, "UNKNOWN">;
  confidence: "tentative" | "solid";
  vpip: number;
  pfr: number;
  handsObserved: number;
};

type Involvement = { present: boolean; vpip: boolean; pfr: boolean; limp: boolean };

// Префлоп-вовлечённость игрока (по его метке actor) в раздаче: вложил ли добровольно
// (VPIP), рейзил/пушил первым (PFR), лимпнул ли (первое добровольное действие — колл).
function preflopInvolvement(snapshot: TableSnapshot, actorLabel: string): Involvement {
  let firstVoluntary: string | null = null;
  let vpip = false;
  let pfr = false;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break;
    if (a.actor !== actorLabel) continue;
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;
    if (a.action === "CHECK" || a.action === "FOLD") continue; // не добровольные деньги

    vpip = true;
    if (firstVoluntary === null) firstVoluntary = a.action;
    if (a.action === "RAISE") pfr = true;
    if (a.action === "ALL_IN" && firstVoluntary === "ALL_IN") pfr = true; // опен/первый пуш = агрессия
  }

  return { present: true, vpip, pfr, limp: firstVoluntary === "CALL" };
}

// Классифицирует оппонента по переданным раздачам (обычно — ДО текущей, в рамках турнира).
// token — obезличенный opponentToken; в каждой раздаче ищем место с этим токеном.
export function classifyOpponent(hands: { tableData: unknown }[], token: string): OpponentProfile {
  let n = 0;
  let vpipN = 0;
  let pfrN = 0;
  let limpN = 0;

  for (const h of hands) {
    const snap = h.tableData as unknown as TableSnapshot;
    const seat = snap.seats.find((s) => s.opponentToken === token);
    if (!seat) continue; // оппонента нет за столом в этой раздаче
    n += 1;
    const inv = preflopInvolvement(snap, seat.label);
    if (inv.vpip) vpipN += 1;
    if (inv.pfr) pfrN += 1;
    if (inv.limp) limpN += 1;
  }

  const pct = (x: number) => (n === 0 ? 0 : Math.round((x / n) * 1000) / 10);
  const vpip = pct(vpipN);
  const pfr = pct(pfrN);
  const limpRate = pct(limpN);

  let type: OpponentType = "UNKNOWN";
  let confidence: OpponentProfile["confidence"] = "none";

  if (n >= OPP_MIN_HANDS) {
    confidence = n >= OPP_SOLID_HANDS ? "solid" : "tentative";
    const gap = vpip - pfr;
    const loose = vpip >= OPP_VPIP_LOOSE;
    const tight = vpip < OPP_VPIP_TIGHT;
    const aggro = gap < OPP_GAP_AGGRO;
    const passive = gap >= OPP_GAP_PASSIVE;

    if (loose && passive) type = "FISH";
    else if (loose) type = "LAG";
    else if (tight && !aggro) type = "NIT";
    else type = "REG";
  }

  return { handsObserved: n, vpip, pfr, limpRate, type, confidence };
}

// Добровольно вложил в ЭТОЙ раздаче (в банке с Hero) — на любой улице: релевантный злодей.
function playedVoluntarily(snapshot: TableSnapshot, actorLabel: string): boolean {
  return snapshot.actions.some(
    (a) =>
      a.actor === actorLabel &&
      (a.action === "CALL" || a.action === "BET" || a.action === "RAISE" || a.action === "ALL_IN"),
  );
}

// Профили злодеев ТЕКУЩЕЙ раздачи (тех, кто в банке с Hero) по рукам ДО неё. UNKNOWN
// (мало рук) отсеиваем — тренеру «нет ридса» не нужно. Токен наружу не отдаём.
export function profileHandOpponents(
  priorHands: { tableData: unknown }[],
  current: TableSnapshot,
): OpponentFact[] {
  const facts: OpponentFact[] = [];
  for (const seat of current.seats) {
    if (seat.label === "Hero" || !seat.opponentToken) continue;
    if (!playedVoluntarily(current, seat.label)) continue;
    const p = classifyOpponent(priorHands, seat.opponentToken);
    if (p.type === "UNKNOWN") continue;
    facts.push({
      seatLabel: seat.label,
      type: p.type,
      confidence: p.confidence as "tentative" | "solid",
      vpip: p.vpip,
      pfr: p.pfr,
      handsObserved: p.handsObserved,
    });
  }
  return facts;
}

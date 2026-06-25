import type { Position, TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { handCode } from "@/config/poker/hand-codes";
import { OPEN_MIN_STACK_BB } from "@/config/poker/rfi-chart";

// Детектор лимпа Hero на префлопе. Правило 1: факт лимпа и код руки считает парсер
// из снимка, не LLM.
//
// Лимп = первое добровольное действие Hero — КОЛЛ, когда ставка на столе всё ещё
// равна большому блайнду (рейза впереди не было). OPEN — до Hero никто не входил
// (открыл лимпом, приглашая весь стол); OVER — впереди уже лимпили, и Hero долимпил
// вместо изоляции. Рейз/фолд/колл рейза/олл-ин Hero — не лимп. Короткий стек —
// пуш-фолд, там «изолируй мелким рейзом» неприменимо, в сомнении не флагаем.

export type HeroLimp = {
  position: Position;
  code: string;
  kind: "OPEN" | "OVER";
};

export function detectHeroLimp(snapshot: TableSnapshot): HeroLimp | null {
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat) return null;
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb || heroSeat.startingStack / bb < OPEN_MIN_STACK_BB) return null;

  let limpersBefore = 0;
  let raisedBefore = false; // был ли рейз/олл-ин впереди — тогда колл Hero это уже не лимп

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break; // дошли до флопа без лимпа Hero
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (a.actor !== "Hero") {
      if (a.action === "FOLD" || a.action === "CHECK") continue;
      if (a.action === "CALL" && !raisedBefore) limpersBefore += 1; // лимп соперника впереди
      else raisedBefore = true; // рейз/олл-ин/колл рейза — банк уже подняли
      continue;
    }

    // Первое добровольное действие — Hero. Лимп только если это колл и впереди не рейзили.
    if (a.action !== "CALL" || raisedBefore) return null;
    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    return { position: heroSeat.position, code, kind: limpersBefore > 0 ? "OVER" : "OPEN" };
  }

  return null;
}

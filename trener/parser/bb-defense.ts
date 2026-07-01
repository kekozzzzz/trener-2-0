import type { TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { handCode } from "@/config/poker/hand-codes";
import { OPEN_MIN_STACK_BB } from "@/config/poker/rfi-chart";
import { bbDefenseOpener, type OpenerPosition } from "@/config/poker/bb-defense-chart";

// Детектор спота защиты BB: Hero на большом блайнде, впереди РОВНО один опен (RFI),
// все остальные сбросили — и Hero отвечает фолдом / коллом / 3-бетом. Правило 1: факт,
// позицию открывашки и код руки считает парсер, не LLM.
//
// НЕ наш спот (→ null): лимпер/коллер впереди (мультивей), второй рейз до Hero (уже
// 3-бет-банк), опен-олл-ин (пуш-фолд, другой чарт), короткий стек Hero (<20bb), опен
// с SB (блайнд-vs-блайнд — bbDefenseOpener вернёт null), олл-ин Hero (3-бет-джем, не судим).

export type HeroBBDefense = {
  openerPosition: OpenerPosition;
  code: string;
  action: "FOLD" | "CALL" | "3BET";
};

export function detectHeroBBDefense(snapshot: TableSnapshot): HeroBBDefense | null {
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat || heroSeat.position !== "BB") return null;
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb || heroSeat.startingStack / bb < OPEN_MIN_STACK_BB) return null;

  let raiser: string | null = null;
  let raiseCount = 0;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break; // дошли до флопа без действия Hero
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue;
      if (a.action === "RAISE") {
        raiseCount += 1;
        if (raiseCount > 1) return null; // 3-бет до Hero → не одиночный опен
        raiser = a.actor;
        continue;
      }
      return null; // лимп/колл/бет/олл-ин впереди → не чистый одиночный опен
    }

    // Первое добровольное действие — Hero (BB). Нужен ровно один опен впереди.
    if (raiseCount !== 1 || !raiser) return null;
    let action: HeroBBDefense["action"];
    if (a.action === "FOLD") action = "FOLD";
    else if (a.action === "CALL") action = "CALL";
    else if (a.action === "RAISE") action = "3BET";
    else return null; // олл-ин/бет/чек — не судим

    const raiserSeat = snapshot.seats.find((s) => s.label === raiser);
    if (!raiserSeat) return null;
    const openerPosition = bbDefenseOpener(raiserSeat.position, raiserSeat.positionName);
    if (!openerPosition) return null;

    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    return { openerPosition, code, action };
  }

  return null;
}

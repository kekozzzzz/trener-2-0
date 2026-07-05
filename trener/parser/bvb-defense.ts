import type { TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { handCode } from "@/config/poker/hand-codes";
import { OPEN_MIN_STACK_BB } from "@/config/poker/rfi-chart";

// Детектор БЛАЙНД-ПРОТИВ-БЛАЙНДА: все сбросили до SB, SB открылся РЕЙЗОМ (не лимп,
// не олл-ин), Hero на BB отвечает фолдом / коллом / 3-бетом. Дополняет bb-defense
// (там SB-опен сознательно исключён). Правило 1: факт и код руки считает парсер.
//
// НЕ наш спот (→ null): кто-то вошёл до SB; SB лимпит (розыгрыш лимпованного банка —
// см. фреймворк) или пушит (это колл-против-пуша); короткий стек Hero; олл-ин Hero
// (3-бет-джем — рестил-чарт).

export type HeroBvbDefense = {
  code: string;
  action: "FOLD" | "CALL" | "3BET";
};

export function detectHeroBvbDefense(snapshot: TableSnapshot): HeroBvbDefense | null {
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat || heroSeat.position !== "BB") return null;
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb || heroSeat.startingStack / bb < OPEN_MIN_STACK_BB) return null;

  let sbRaised = false;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break;
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue;
      const seat = snapshot.seats.find((s) => s.label === a.actor);
      if (!seat || seat.position !== "SB" || a.action !== "RAISE" || sbRaised) return null;
      sbRaised = true; // одиночный опен-рейз SB при фолде до него
      continue;
    }

    if (!sbRaised) return null;
    let action: HeroBvbDefense["action"];
    if (a.action === "FOLD") action = "FOLD";
    else if (a.action === "CALL") action = "CALL";
    else if (a.action === "RAISE") action = "3BET";
    else return null; // олл-ин — рестил-чарт, чек невозможен против рейза

    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    return { code, action };
  }

  return null;
}

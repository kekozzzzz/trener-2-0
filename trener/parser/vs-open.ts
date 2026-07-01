import type { TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { handCode } from "@/config/poker/hand-codes";
import { OPEN_MIN_STACK_BB, type OpenPosition } from "@/config/poker/rfi-chart";
import { vsOpenPosition } from "@/config/poker/vs-open-chart";

// Детектор спота «против одиночного опена» (Hero НЕ в BB): впереди РОВНО один опен
// (RFI), все прочие сбросили, и Hero отвечает фолдом / коллом / 3-бетом. Правило 1:
// факт, нашу позицию и код руки считает парсер, не LLM.
//
// Hero в BB → отдельный чарт защиты BB (parser/bb-defense). НЕ наш спот (→ null):
// лимпер/коллер впереди, второй рейз до Hero, опен-олл-ин (пуш-фолд), короткий стек,
// Hero сам открывается (рейза впереди нет), позиция не судима.

export type HeroVsOpen = {
  heroPosition: OpenPosition;
  code: string;
  action: "FOLD" | "CALL" | "3BET";
};

export function detectHeroVsOpen(snapshot: TableSnapshot): HeroVsOpen | null {
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat || heroSeat.position === "BB") return null; // BB — отдельный чарт
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb || heroSeat.startingStack / bb < OPEN_MIN_STACK_BB) return null;

  let raiseCount = 0;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break; // дошли до флопа без действия Hero
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue;
      if (a.action === "RAISE") {
        raiseCount += 1;
        if (raiseCount > 1) return null; // 3-бет до Hero → не одиночный опен
        continue;
      }
      return null; // лимп/колл/бет/олл-ин впереди → не чистый одиночный опен
    }

    // Первое добровольное действие — Hero. Нужен ровно один опен впереди.
    if (raiseCount !== 1) return null;
    let action: HeroVsOpen["action"];
    if (a.action === "FOLD") action = "FOLD";
    else if (a.action === "CALL") action = "CALL";
    else if (a.action === "RAISE") action = "3BET";
    else return null; // олл-ин/бет/чек — не судим

    const heroPosition = vsOpenPosition(heroSeat.position, heroSeat.positionName);
    if (!heroPosition) return null;
    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    return { heroPosition, code, action };
  }

  return null;
}

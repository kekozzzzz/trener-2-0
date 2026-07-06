import type { TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { handCode } from "@/config/poker/hand-codes";
import { OPEN_MIN_STACK_BB, type OpenPosition } from "@/config/poker/rfi-chart";
import { squeezePosition } from "@/config/poker/squeeze-chart";

// Детектор сквиза: впереди РОВНО один опен (RFI) и как минимум один КОЛЛЕР этого опена,
// второго рейза не было, и Hero поднимает (3-бетит поверх = сквиз). Правило 1: факт,
// позицию и код руки считает парсер, не LLM.
//
// НЕ наш спот (→ null): коллера нет (это обычный 3-бет vs опен, parser/vs-open); лимп
// до опена (грязный банк); второй рейз до Hero (уже 3-бет); Hero не рейзит; короткий
// стек; позиция не судима.

// Сквизуют чаще всего именно из блайндов — SB/BB судимы наравне с остальными
// (найдено аудитом 2026-07-06: сквиз AQs из BB оставался без вердикта чарта).
export type HeroSqueeze = { heroPosition: OpenPosition | "SB" | "BB"; code: string };

export function detectHeroSqueeze(snapshot: TableSnapshot): HeroSqueeze | null {
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat) return null;
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb || heroSeat.startingStack / bb < OPEN_MIN_STACK_BB) return null;

  let raiseCount = 0;
  let callers = 0;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break; // дошли до флопа без действия Hero
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue;
      if (a.action === "RAISE") {
        raiseCount += 1;
        if (raiseCount > 1) return null; // второй рейз → уже 3-бет, не сквиз
        continue;
      }
      if (a.action === "CALL") {
        if (raiseCount === 0) return null; // лимп до опена — грязный банк, не сквиз
        callers += 1; // коллер опена
        continue;
      }
      return null; // бет/олл-ин впереди → не наш спот
    }

    // Первое добровольное действие — Hero. Сквиз: есть опен + коллер, и Hero рейзит.
    if (raiseCount !== 1 || callers < 1) return null;
    if (a.action !== "RAISE") return null; // фолд/колл/олл-ин — не сквиз
    const heroPosition =
      squeezePosition(heroSeat.position, heroSeat.positionName) ??
      (heroSeat.position === "SB" || heroSeat.position === "BB" ? heroSeat.position : null);
    if (!heroPosition) return null;
    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    return { heroPosition, code };
  }

  return null;
}

import type { TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { handCode } from "@/config/poker/hand-codes";
import { OPEN_MIN_STACK_BB, type OpenPosition } from "@/config/poker/rfi-chart";
import { defVs3betPosition } from "@/config/poker/def-vs-3bet-chart";

// Детектор спота «защита vs 3-бет»: Hero открылся первым (RFI-рейз), в него пришёл
// РОВНО один 3-бет, свернулось к Hero, и Hero отвечает 4-бетом / коллом / фолдом.
// Правило 1: факт, нашу открывавшую позицию и код руки считает парсер, не LLM.
//
// НЕ наш спот (→ null): Hero не открывал первым (кто-то вошёл раньше / Hero лимпил);
// коллер нашего опена до 3-бета (мультивей); второй рейз (4-бет соперника до нас);
// 3-бет-олл-ин (джем — другой спот); короткий стек; позиция не судима; олл-ин Hero.

export type HeroDefVs3bet = {
  heroPosition: OpenPosition;
  code: string;
  action: "4BET" | "CALL" | "FOLD";
};

export function detectHeroDefVs3bet(snapshot: TableSnapshot): HeroDefVs3bet | null {
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat) return null;
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb || heroSeat.startingStack / bb < OPEN_MIN_STACK_BB) return null;

  let heroPosition: OpenPosition | null = null;
  let raisesAfterOpen = 0;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break; // дошли до флопа без ответа Hero
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (!heroPosition) {
      // Ждём первое добровольное действие Hero — оно должно быть открытием (рейз).
      if (a.actor !== "Hero") {
        if (a.action === "FOLD") continue;
        return null; // кто-то вошёл до Hero → Hero не открывашка
      }
      if (a.action !== "RAISE") return null; // Hero лимпит/не открывает
      const pos = defVs3betPosition(heroSeat.position, heroSeat.positionName);
      if (!pos) return null;
      heroPosition = pos;
      continue;
    }

    // После открытия Hero.
    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue;
      if (a.action === "RAISE") {
        raisesAfterOpen += 1;
        if (raisesAfterOpen > 1) return null; // 4-бет соперника до нас
        continue;
      }
      return null; // колл нашего опена / бет / 3-бет-олл-ин → не чистая защита vs 3-бет
    }

    // Второе действие Hero — ответ на 3-бет. Нужен ровно один 3-бет впереди.
    if (raisesAfterOpen !== 1) return null;
    let action: HeroDefVs3bet["action"];
    if (a.action === "RAISE") action = "4BET";
    else if (a.action === "CALL") action = "CALL";
    else if (a.action === "FOLD") action = "FOLD";
    else return null; // олл-ин/бет/чек — не судим

    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    return { heroPosition, code, action };
  }

  return null;
}

import type { TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { handCode } from "@/config/poker/hand-codes";
import { OPEN_MIN_STACK_BB, openChartPosition, type OpenPosition } from "@/config/poker/rfi-chart";

// Детектор изоляции: впереди ≥1 лимпер (открыл лимпом), рейза до Hero не было, и Hero
// поднимает (изолирует). Правило 1: факт, позицию и код руки считает парсер, не LLM.
//
// НЕ наш спот (→ null): рейз впереди (это уже 3-бет/сквиз, не изоляция); Hero фолдит
// или сам докалливает (оверлимп ловит limp-детектор); лимперов нет; короткий стек;
// позиция не судима (BB и пр.).

export type HeroIso = { heroPosition: OpenPosition; code: string };

export function detectHeroIso(snapshot: TableSnapshot): HeroIso | null {
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat) return null;
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb || heroSeat.startingStack / bb < OPEN_MIN_STACK_BB) return null;

  let limpers = 0;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break; // дошли до флопа без действия Hero
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue;
      if (a.action === "CALL") {
        limpers += 1; // лимп впереди (рейза ещё не было — иначе вышли бы ниже)
        continue;
      }
      return null; // рейз/бет/олл-ин впереди → не изоляция (3-бет/сквиз/пуш)
    }

    // Первое добровольное действие — Hero. Изоляция только если есть лимпер и Hero рейзит.
    if (limpers < 1) return null;
    if (a.action !== "RAISE") return null; // фолд/оверлимп/олл-ин — не наш спот
    const heroPosition = openChartPosition(heroSeat.position, heroSeat.positionName);
    if (!heroPosition) return null;
    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    return { heroPosition, code };
  }

  return null;
}

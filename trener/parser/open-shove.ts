import type { TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { handCode } from "@/config/poker/hand-codes";
import { pushPosition, stackBandFor, type PushPosition, type StackBand } from "@/config/poker/push-fold-chart";

// Детектор опен-шова: Hero первым добровольным действием на префлопе идёт ОЛЛ-ИН,
// до него никто не вошёл (все сбросили), стек в пуш-фолд-зоне (<15bb). Правило 1:
// факт шова, позицию, стек-бэнд и код руки считает парсер, не LLM.
//
// НЕ наш спот (→ null): кто-то вошёл до Hero (лимп/рейз/колл/олл-ин); Hero не шовит,
// а рейзит/лимпит; стек ≥15bb (уже опен-рейз, не пуш); позиция не судима (BB/OTHER).

export type HeroOpenShove = { position: PushPosition; band: StackBand; code: string };

export function detectHeroOpenShove(snapshot: TableSnapshot): HeroOpenShove | null {
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat) return null;
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb) return null;
  const band = stackBandFor(heroSeat.startingStack / bb);
  if (!band) return null; // ≥15bb — не пуш-фолд

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break; // дошли до флопа без действия Hero
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue; // соперник до Hero сбросил — опен-шов ещё возможен
      return null; // кто-то вошёл до Hero → не «первым в банк»
    }

    // Первое добровольное действие — Hero. Опен-шов только если это олл-ин.
    if (a.action !== "ALL_IN") return null;
    const position = pushPosition(heroSeat.position, heroSeat.positionName);
    if (!position) return null;
    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    return { position, band, code };
  }

  return null;
}

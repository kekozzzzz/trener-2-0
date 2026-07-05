import type { TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { handCode } from "@/config/poker/hand-codes";
import { openChartPosition } from "@/config/poker/rfi-chart";
import { stackBandFor, type StackBand } from "@/config/poker/push-fold-chart";
import { pusherGroup, type PusherGroup } from "@/config/poker/call-vs-push-chart";

// Детектор КОЛЛА ПРОТИВ ОПЕН-ОЛЛ-ИНА: кто-то запушил ПЕРВЫМ В БАНК на стеке ≤14bb,
// до Hero все остальные сбросили, и Hero решает — колл (в т.ч. своим олл-ином поверх,
// это тот же колл против пушера + изоляция) или фолд. Правило 1: факт, группу пушера,
// его стек-бэнд и код руки считает парсер, не LLM.
//
// НЕ наш спот (→ null): пуш не первым в банк (лимп/рейз до него); кто-то уже
// заколлировал пуш до Hero (оверколл — другая математика); стек пушера ≥15bb
// (это опен-рейз, не пуш-фолд); Hero чекнул (BB против пуша-доплаты не бывает).

export type HeroCallVsPush = {
  pusherGroup: PusherGroup;
  pusherBand: StackBand;
  code: string;
  action: "CALL" | "FOLD";
};

export function detectHeroCallVsPush(snapshot: TableSnapshot): HeroCallVsPush | null {
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat) return null;
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb) return null;

  let pusher: string | null = null;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break;
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue;
      if (a.action === "ALL_IN" && pusher === null) {
        pusher = a.actor; // первый добровольный вход — олл-ин
        continue;
      }
      return null; // лимп/рейз/колл до пуша или оверколл после — не наш спот
    }

    // Первое добровольное действие Hero. Нужен ровно один опен-олл-ин впереди.
    if (!pusher) return null;
    let action: HeroCallVsPush["action"];
    if (a.action === "CALL" || a.action === "ALL_IN") action = "CALL";
    else if (a.action === "FOLD") action = "FOLD";
    else return null; // чек/бет — не колл-против-пуша

    const pusherSeat = snapshot.seats.find((s) => s.label === pusher);
    if (!pusherSeat) return null;
    const band = stackBandFor(pusherSeat.startingStack / bb);
    if (!band) return null; // пушер ≥15bb — не пуш-фолд спот
    const pos = openChartPosition(pusherSeat.position, pusherSeat.positionName);
    if (!pos) return null;

    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    return { pusherGroup: pusherGroup(pos), pusherBand: band, code, action };
  }

  return null;
}

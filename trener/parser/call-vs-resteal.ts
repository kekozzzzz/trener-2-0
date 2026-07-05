import type { TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { handCode } from "@/config/poker/hand-codes";
import { OPEN_MIN_STACK_BB, openChartPosition } from "@/config/poker/rfi-chart";
import { restealBandFor, restealOpenerGroup, type RestealBand, type RestealOpenerGroup } from "@/config/poker/resteal-chart";

// Детектор КОЛЛА ПРОТИВ РЕСТИЛА: Hero открылся первым (RFI-рейз), в него прилетел
// РОВНО один 3-бет-ОЛЛ-ИН со стека 10–20bb (без коллеров между), и Hero решает —
// колл или фолд. Дополняет def-vs-3bet (там джем сознательно исключён). Правило 1:
// факт, группу нашей позиции, бэнд джемящего и код руки считает парсер.

export type HeroCallVsResteal = {
  openerGroup: RestealOpenerGroup; // группа НАШЕЙ открывавшей позиции (ширина их джема)
  jamBand: RestealBand; // стек джемящего: LOW 10-14bb / HIGH 14-20bb
  code: string;
  action: "CALL" | "FOLD";
};

export function detectHeroCallVsResteal(snapshot: TableSnapshot): HeroCallVsResteal | null {
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat) return null;
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb || heroSeat.startingStack / bb < OPEN_MIN_STACK_BB) return null;

  let opened = false;
  let jammer: string | null = null;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break;
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (!opened) {
      if (a.actor !== "Hero") {
        if (a.action === "FOLD") continue;
        return null; // кто-то вошёл до Hero — Hero не открывашка
      }
      if (a.action !== "RAISE") return null;
      opened = true;
      continue;
    }

    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue;
      if (a.action === "ALL_IN" && jammer === null) {
        jammer = a.actor;
        continue;
      }
      return null; // колл опена / второй рейз / оверколл — не чистый рестил в нас
    }

    // Второе действие Hero — ответ на джем.
    if (!jammer) return null;
    let action: HeroCallVsResteal["action"];
    if (a.action === "CALL" || a.action === "ALL_IN") action = "CALL";
    else if (a.action === "FOLD") action = "FOLD";
    else return null;

    const jammerSeat = snapshot.seats.find((s) => s.label === jammer);
    if (!jammerSeat) return null;
    const jamBand = restealBandFor(jammerSeat.startingStack / bb);
    if (!jamBand) return null; // джем вне 10-20bb — другой спот (пуш-фолд или глубокий 3-бет)
    const heroPos = openChartPosition(heroSeat.position, heroSeat.positionName);
    if (!heroPos) return null;

    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    return { openerGroup: restealOpenerGroup(heroPos), jamBand, code, action };
  }

  return null;
}

import type { TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { handCode } from "@/config/poker/hand-codes";
import { openChartPosition } from "@/config/poker/rfi-chart";
import {
  restealBandFor,
  restealOpenerGroup,
  type RestealBand,
  type RestealOpenerGroup,
} from "@/config/poker/resteal-chart";

// Детектор РЕСТИЛА: Hero на стеке 10–20bb отвечает ОЛЛ-ИНОМ на одиночный опен (ровно
// один рейз до Hero, без коллеров между опеном и Hero — с коллером это сквиз-джем,
// другой спот, не судим). Правило 1: факт, группу опенера, бэнд и код руки считает
// парсер, не LLM. Родился из аудита 2026-07-05: тренер называл стандартный рестил
// A2s 14bb ошибкой — теперь вердикт эталона в фактах.

export type HeroResteal = {
  openerGroup: RestealOpenerGroup;
  band: RestealBand;
  code: string;
};

export function detectHeroResteal(snapshot: TableSnapshot): HeroResteal | null {
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat) return null;
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb) return null;
  const band = restealBandFor(heroSeat.startingStack / bb);
  if (!band) return null; // вне 10–20bb — не рестил-спот

  let raiser: string | null = null;
  let raiseCount = 0;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break;
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue;
      if (a.action === "RAISE") {
        raiseCount += 1;
        if (raiseCount > 1) return null; // 3-бет до Hero — не наш спот
        raiser = a.actor;
        continue;
      }
      return null; // лимп/колл/олл-ин впереди — не чистый одиночный опен
    }

    // Первое добровольное действие Hero: рестил = олл-ин поверх ровно одного опена.
    if (a.action !== "ALL_IN") return null;
    if (raiseCount !== 1 || !raiser) return null;

    const raiserSeat = snapshot.seats.find((s) => s.label === raiser);
    if (!raiserSeat) return null;
    const openerPos = openChartPosition(raiserSeat.position, raiserSeat.positionName);
    if (!openerPos) return null;

    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    return { openerGroup: restealOpenerGroup(openerPos), band, code };
  }

  return null;
}

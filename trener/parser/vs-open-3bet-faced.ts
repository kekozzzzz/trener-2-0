import type { Seat, TableAction, TableSnapshot } from "./types";
import { vsOpenPosition } from "@/config/poker/vs-open-chart";
import type { OpenPosition } from "@/config/poker/rfi-chart";

// Детектор «Hero открылся → получил 3-бет» — зеркало detectHeroVsOpen (vs-open.ts),
// но с другой стороны стола: там судим ОТВЕТ Hero на чужой опен, здесь ищем ПОЗИЦИЮ
// соперника, который сделал 3-бет ПРОТИВ открытия Hero (для эталонного диапазона
// в range-facts.ts, план 2026-07-26-эталонный-3бет-диапазон.md).
//
// Спот узкий и строгий, как у детекторов-соседей: Hero первым добровольным действием
// на префлопе делает РЕЙЗ (открытие), дальше РОВНО один соперник отвечает РЕЙЗОМ без
// чужих коллов/рейзов до него — это и есть 3-бетующий. Кто-то ещё вошёл (лимп/колл/
// сквиз/второй рейз) → не наш спот (→ null): диапазон 3-бета «против одиночного
// опена» (vs-open-chart.ts) на сквиз/мультивей не рассчитан.

export type HeroOpenFacedThreeBet = {
  threebetterSeatLabel: string;
  // null — 3-бетующий вне чарта (например, BB — у него свой чарт защиты BB).
  threebetterPosition: OpenPosition | null;
  // Ответ Hero на 3-бет как есть (FOLD/CALL/ALL_IN/RAISE…) — эталонный диапазон как
  // ФАКТ ЭКВИТИ (не просто «в диапазоне ли рука») уместен только когда это ALL_IN:
  // деньги уже все в банке на префлопе, дальше нечего играть (решение с Артёмом 26.07,
  // план 2026-07-26-эталонный-3бет-диапазон.md). Определяет вызывающий код.
  heroAction: TableAction["action"];
};

export function detectHeroOpenFacedThreeBet(snapshot: TableSnapshot): HeroOpenFacedThreeBet | null {
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat) return null;

  let heroOpened = false;
  let threebetter: Seat | null = null;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break; // дошли до флопа без ответа Hero на 3-бет
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (!heroOpened) {
      if (a.actor !== "Hero") {
        if (a.action === "FOLD") continue; // соперник до Hero сбросил — открытие ещё возможно
        return null; // лимп/рейз/колл/олл-ин до Hero → Hero не открывался первым
      }
      if (a.action !== "RAISE") return null; // первое действие Hero — не рейз (шов/лимп)
      heroOpened = true;
      continue;
    }

    if (a.actor === "Hero") {
      if (!threebetter) return null; // контроль вернулся к Hero без 3-бета — не наш спот
      return {
        threebetterSeatLabel: threebetter.label,
        threebetterPosition: vsOpenPosition(threebetter.position, threebetter.positionName),
        heroAction: a.action,
      };
    }

    if (a.action === "FOLD") continue;
    if (a.action === "RAISE" && !threebetter) {
      const seat = snapshot.seats.find((s) => s.label === a.actor);
      if (!seat) return null;
      threebetter = seat;
      continue;
    }
    return null; // колл/бет/олл-ин впереди, или второй рейз не от Hero (сквиз) — не чистый 3-бет
  }

  return null; // раздача оборвалась до ответа Hero
}

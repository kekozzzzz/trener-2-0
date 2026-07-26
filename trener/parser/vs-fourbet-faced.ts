import type { Seat, TableAction, TableSnapshot } from "./types";
import { defVs3betPosition } from "@/config/poker/def-vs-3bet-chart";
import type { OpenPosition } from "@/config/poker/rfi-chart";

// Детектор «Hero (3-бет/сквиз) получил 4-бет от исходного опенера» (план
// 2026-07-27-выиграл-но-ошибся-vs-4бет.md) — для эталонного диапазона 4-бета в
// decision-weight.ts, когда нужно судить продолжение Hero не по вскрытой руке
// соперника, а по ТИПОВОМУ диапазону 4-бета опенера.
//
// Отличие от detectHeroDefVs3bet (parser/def-vs-3bet.ts): там Hero — САМ опенер,
// и мультивей (коллер до 3-бета) выключает спот. Здесь наоборот: Hero НЕ опенер,
// а отвечает своим единственным рейзом (3-бет ИЛИ сквиз — не различаем, оба дают
// один и тот же типовой 4-бет опенера) — коллеры/фолды МЕЖДУ опеном и рейзом Hero
// разрешены (сквиз — наш целевой случай). Не наш спот (→ null): Hero сама опенер
// (это спот def-vs-3bet.ts), 4-бет пришёл НЕ от исходного опенера (другая динамика,
// чарт не про неё), второй рейз до Hero (Hero отвечает уже не на первый 4-бет),
// лимп/колл/бет впереди открытия.

export type HeroFacedFourBet = {
  openerSeatLabel: string;
  // null — опенер вне чарта позиций (напр. BB) — эталонного диапазона для него нет.
  openerPosition: OpenPosition | null;
  heroAction: TableAction["action"];
};

export function detectHeroFacedFourBet(snapshot: TableSnapshot): HeroFacedFourBet | null {
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat) return null;

  let opener: Seat | null = null;
  let heroRaised = false;
  let fourBetter: Seat | null = null;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break; // дошли до флопа без ответа Hero на 4-бет
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (!opener) {
      if (a.actor === "Hero") return null; // Hero открылась первой → спот def-vs-3bet.ts, не наш
      if (a.action === "FOLD") continue;
      if (a.action !== "RAISE") return null; // лимп/колл до открытия — не открытие рейзом
      const seat = snapshot.seats.find((s) => s.label === a.actor);
      if (!seat) return null;
      opener = seat;
      continue;
    }

    if (!heroRaised) {
      if (a.actor === "Hero") {
        if (a.action !== "RAISE") return null; // Hero не рейзит (колл/фолд) — другой спот
        heroRaised = true;
        continue;
      }
      if (a.action === "FOLD" || a.action === "CALL") continue; // сквиз-сетап разрешён
      return null; // ещё один рейз (уже 3-бет от кого-то ДО Hero) или бет/олл-ин — не наш спот
    }

    if (a.actor === "Hero") {
      if (!fourBetter) return null; // контроль вернулся к Hero без 4-бета — не наш спот
      return {
        openerSeatLabel: opener.label,
        openerPosition: defVs3betPosition(opener.position, opener.positionName),
        heroAction: a.action,
      };
    }

    if (a.action === "FOLD") continue;
    if (a.action === "RAISE" && !fourBetter) {
      if (a.actor !== opener.label) return null; // 4-бет НЕ от исходного опенера — не наш чарт
      fourBetter = opener;
      continue;
    }
    return null; // колл/бет/олл-ин впереди, или второй рейз не от опенера — не чистый спот
  }

  return null; // раздача оборвалась до ответа Hero
}

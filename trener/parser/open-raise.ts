import type { TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { handCode } from "@/config/poker/hand-codes";
import { OPEN_MIN_STACK_BB, openChartPosition } from "@/config/poker/rfi-chart";

// Детектор «открылся первым» (raise-first-in). Правило 1: факт открытия и код руки
// считает парсер из снимка, не LLM. Сверку с чартом делает config/poker/rfi-chart.
//
// Открытие = Hero первым добровольным действием на префлопе делает РЕЙЗ, и до него
// никто не входил (все, кто действовал раньше, сбросили; посты блайндов/анте —
// вынужденные, не в счёт). Лимп или рейз впереди → это не RFI (изоляция/3-бет),
// олл-ин впереди → тоже нет. Олл-ин Hero первым — пуш-фолд, не RFI-чарт, пропускаем.

// position — позиция ЧАРТА (UTG/MP/HJ/CO/BTN/SB), сведённая из снимка через
// openChartPosition (ранние разводятся на UTG/MP по positionName). Несудимые места
// (BB/OTHER) возвращаются как есть — их отсеет isOpenPosition у потребителя.
export type HeroOpen = { position: string; code: string };

export function detectHeroOpen(snapshot: TableSnapshot): HeroOpen | null {
  // Короткий стек — это пуш-фолд, RFI-чарт неприменим (в сомнении не флагать).
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat) return null;
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb || heroSeat.startingStack / bb < OPEN_MIN_STACK_BB) return null;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break; // дошли до флопа без открытия Hero
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue; // соперник до Hero сбросил — RFI ещё возможен
      return null; // лимп/колл/рейз/олл-ин до Hero → не открытие
    }

    // Первое добровольное действие — Hero. Только чистый рейз считаем открытием.
    if (a.action !== "RAISE") return null;
    const code = handCode(snapshot.heroCards);
    if (!code) return null;
    const position = openChartPosition(heroSeat.position, heroSeat.positionName) ?? heroSeat.position;
    return { position, code };
  }

  return null;
}

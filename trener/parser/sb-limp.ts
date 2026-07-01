import type { TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { handCode } from "@/config/poker/hand-codes";
import { OPEN_MIN_STACK_BB } from "@/config/poker/rfi-chart";

// Детектор SB-лимпа: фолд до SB, Hero завершает блайнд коллом (комплит), не рейзит.
// Параллель RFI-открыванию (parser/open-raise.ts), но для лимпа. SB-лимп слабых рук
// при фолде до тебя — законная часть стратегии, не утечка (см. rfi-chart.ts, оговорка
// про SB). Правило 1: факт лимпа и код руки считает парсер, не LLM. Только SB.
//
// Короткий стек (<20bb) — пуш-фолд, лимп неприменим (в сомнении не считаем). Если до
// Hero кто-то вошёл (лимп/рейз) — это уже не чистый SB-лимп при фолде до тебя.
export function detectHeroSbLimp(snapshot: TableSnapshot): string | null {
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat || heroSeat.position !== "SB") return null;
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb || heroSeat.startingStack / bb < OPEN_MIN_STACK_BB) return null;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break; // до флопа Hero не завершал — не лимп
    if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") continue;

    if (a.actor !== "Hero") {
      if (a.action === "FOLD") continue; // соперник до Hero сбросил — фолд до SB ещё возможен
      return null; // кто-то вошёл до Hero → не чистый SB-лимп
    }

    // Первое добровольное действие Hero: только колл (комплит блайнда) = лимп.
    if (a.action !== "CALL") return null; // рейз/олл-ин/фолд — не лимп
    return handCode(snapshot.heroCards);
  }

  return null;
}

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

// Что было ПОСЛЕ лимпа: большой блайнд поднял, и Hero ответил. Именно этот спот судит
// sb-limp-chart (лимп-колл против лимп-фолда). Заказ Артёма 19.07.
//
// Возвращает null, если лимпа не было ИЛИ BB не поднимал (тогда судить нечего — играем флоп)
// ИЛИ Hero ответил не коллом/фолдом (рейз = ситуативный лимп-рейз, чартом сознательно не судится,
// см. SB_LIMP_RAISE_HINT).
export type HeroSbLimpFacingRaise = {
  code: string;
  action: "CALL" | "FOLD";
};

export function detectHeroSbLimpFacingRaise(snapshot: TableSnapshot): HeroSbLimpFacingRaise | null {
  const code = detectHeroSbLimp(snapshot);
  if (!code) return null;

  const preflop = snapshot.actions.filter((a) => a.street === "PREFLOP");
  const heroLimpIdx = preflop.findIndex((a) => a.actor === "Hero" && a.action === "CALL");
  if (heroLimpIdx < 0) return null;

  const after = preflop.slice(heroLimpIdx + 1);
  // BB должен ПОДНЯТЬ (иначе идём на флоп — судить нечего). Олл-ин BB тоже подъём.
  const raisedIdx = after.findIndex(
    (a) => a.actor !== "Hero" && (a.action === "RAISE" || a.action === "ALL_IN"),
  );
  if (raisedIdx < 0) return null;

  const heroReply = after.slice(raisedIdx + 1).find((a) => a.actor === "Hero");
  if (!heroReply) return null;
  if (heroReply.action === "CALL" || heroReply.action === "ALL_IN") return { code, action: "CALL" };
  if (heroReply.action === "FOLD") return { code, action: "FOLD" };
  return null; // рейз в ответ — лимп-рейз, чартом не судим
}

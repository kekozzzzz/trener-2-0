import type { Seat } from "../types";

// Кто и сколько забрал из банка на вскрытии — из строк HH "collected" (аналог shown-cards).
// Нужно, чтобы тренер знал ПОБЕДИТЕЛЯ детерминированно (мультивей/сайд-поты), а не выводил
// его из знака chipResult. Ник живёт только внутри вызова, сумма цепляется к обезличенному
// месту (Seat.collected), в вывод парсера ник не попадает.
//
// Форматы строк выигрыша:
//   GG / PokerStars / Winamax / WPN / Chico:  «ник[:] collected 1,320 from pot/main pot/side pot-1»
//   888poker:                                  «ник collected [ 1320 ]» — сумма в скобках, без "from"
const FROM_LINE = /^(.+?):? collected ([\d,]+) from /gm;
const BRACKET_LINE = /^(.+?) collected \[\s*([\d,]+)\s*\]/gm;

const parseNum = (s: string) => parseInt(s.replace(/,/g, ""), 10);

export function collectedByNick(handText: string): Map<string, number> {
  const out = new Map<string, number>();
  const add = (nick: string, amt: number) => {
    if (Number.isFinite(amt)) out.set(nick, (out.get(nick) ?? 0) + amt);
  };
  for (const m of handText.matchAll(FROM_LINE)) add(m[1], parseNum(m[2]));
  for (const m of handText.matchAll(BRACKET_LINE)) add(m[1], parseNum(m[2]));
  return out;
}

// Проставить забранные фишки местам ОДНОЙ раздачи по карте «номер места → сырой ник».
export function assignCollected(
  seats: Seat[],
  namesBySeat: Record<number, string>,
  collected: Map<string, number>,
): void {
  if (collected.size === 0) return;
  for (const seat of seats) {
    const nick = seat.seatNumber != null ? namesBySeat[seat.seatNumber] : undefined;
    const amt = nick ? collected.get(nick) : undefined;
    if (amt != null) seat.collected = amt;
  }
}

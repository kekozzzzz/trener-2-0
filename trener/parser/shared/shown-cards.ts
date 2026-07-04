import type { Seat } from "../types";

// Вскрытые на шоудауне карты соперников (план 2026-07-04-критические-по-доезду):
// нужны детектору доезда — «Hero крупно вложился далеко позади и доехал». Общий
// механизм текстовых румов, как opponent-tokens: ник живёт только внутри вызова,
// карты цепляются к обезличенному месту (Seat.shownCards), в вывод ник не попадает.
//
// Форматы строк вскрытия:
//   GG / PokerStars / Chico / 888:  «ник: shows [Ah Kd] (...)»
//   Winamax / WPN:                  «ник shows [Ah Kd] (...)»
// Один регэксп с необязательным двоеточием кроет все; ник — до « shows».
const SHOWS_LINE = /^(.+?):? shows \[([2-9TJQKA][cdhs]) ([2-9TJQKA][cdhs])\]/gm;

export function shownCardsByNick(handText: string): Map<string, [string, string]> {
  const out = new Map<string, [string, string]>();
  for (const m of handText.matchAll(SHOWS_LINE)) out.set(m[1], [m[2], m[3]]);
  return out;
}

// Проставить вскрытые карты местам ОДНОЙ раздачи по карте «номер места → сырой ник».
// Hero пропускаем — его карты и так в heroCards снимка.
export function assignShownCards(
  seats: Seat[],
  namesBySeat: Record<number, string>,
  shown: Map<string, [string, string]>,
): void {
  if (shown.size === 0) return;
  for (const seat of seats) {
    if (seat.label === "Hero") continue;
    const nick = seat.seatNumber != null ? namesBySeat[seat.seatNumber] : undefined;
    const cards = nick ? shown.get(nick) : undefined;
    if (cards) seat.shownCards = [...cards];
  }
}

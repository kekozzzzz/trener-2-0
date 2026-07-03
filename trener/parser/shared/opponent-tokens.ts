import type { Seat } from "../types";

// Обезличенные СТАБИЛЬНЫЕ псевдонимы оппонентов в рамках турнира: сырой ник → "oppN"
// (один человек — один псевдоним во всех его раздачах). Ники живут только внутри
// парсера, в вывод попадает лишь псевдоним — по нему parser/opponent-profile склеивает
// оппонента между раздачами. Общий механизм всех румов (образец — ggpoker/index.ts,
// приватностный редизайн 2026-07-01: HMAC/seatNames отвергнуты, ник не покидает функцию).
export function opponentTokenizer(): (nick: string) => string {
  const nickToToken = new Map<string, string>();
  return (nick: string): string => {
    const existing = nickToToken.get(nick);
    if (existing) return existing;
    const token = `opp${nickToToken.size + 1}`;
    nickToToken.set(nick, token);
    return token;
  };
}

// Проставить псевдонимы местам ОДНОЙ раздачи по карте «номер места → сырой ник».
// Hero псевдоним не получает (его метка и так «Hero»), места без ника пропускаются.
export function assignOpponentTokens(
  seats: Seat[],
  namesBySeat: Record<number, string>,
  tokenFor: (nick: string) => string,
): void {
  for (const seat of seats) {
    if (seat.label === "Hero") continue;
    const nick = seat.seatNumber != null ? namesBySeat[seat.seatNumber] : undefined;
    if (nick) seat.opponentToken = tokenFor(nick);
  }
}

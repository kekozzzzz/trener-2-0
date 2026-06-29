import type { ParseResult } from "./types";
import { parseGGPokerMtt } from "./ggpoker";
import { parseWpnMtt } from "./wpn";

// Роутер форматов: по сигнатуре заголовка первой раздачи выбираем парсер рума.
// Контракт ParseResult / ParsedTournament для остального кода не меняется.
const GG_HEADER = /^Poker Hand #(?:RC-GGPoker-\d{8}-\d+|TM\d+): Tournament #/m;
const WPN_HEADER = /^Game Hand #\d+ - Tournament #\d+ - /m;

export function parseHandHistory(buffer: Buffer): ParseResult {
  const text = buffer.toString("utf-8");

  if (WPN_HEADER.test(text)) return parseWpnMtt(buffer);
  if (GG_HEADER.test(text)) return parseGGPokerMtt(buffer);

  return {
    ok: false,
    error: {
      type: "UNSUPPORTED_FORMAT",
      message: "Формат файла не распознан. Поддерживаются GGPoker и ACR / PokerKing (WPN).",
    },
  };
}

// Дешёвый «нюх» ключа турнира из заголовка — без полного разбора. Нужен пакетной
// загрузке, чтобы сгруппировать и склеить файлы ОДНОГО турнира. Возвращаем ключ
// ТОЛЬКО для румов, которые пишут турнир несколькими файлами — сейчас это WPN
// (ACR/PokerKing: один файл на стол, при балансировке игрока пересаживают). GG и
// прочие пишут турнир одним файлом — их НЕ группируем (иначе случайно слитый
// дубль-файл удвоил бы раздачи; дедуп таких ловит обычная дедупликация турниров).
const WPN_KEY = /^Game Hand #\d+ - Tournament #(\d+)/m;

export function sniffTournamentKey(buffer: Buffer): { room: string; tournamentId: string } | null {
  const wpn = WPN_KEY.exec(buffer.toString("utf-8"));
  if (wpn) return { room: "WPN", tournamentId: wpn[1] };
  return null;
}

export { parseGGPokerMtt } from "./ggpoker";
export { parseWpnMtt } from "./wpn";

import type { ParseResult } from "./types";
import { parseGGPokerMtt } from "./ggpoker";
import { parseWpnMtt } from "./wpn";
import { parsePokerStarsMtt } from "./ps";
import { parseIpokerMtt } from "./ipoker";
import { parseWinamaxMtt } from "./winamax";
import { parse888Mtt } from "./poker888";

// Роутер форматов: по сигнатуре заголовка первой раздачи выбираем парсер рума.
// Контракт ParseResult / ParsedTournament для остального кода не меняется.
const GG_HEADER = /^Poker Hand #(?:RC-GGPoker-\d{8}-\d+|TM\d+): Tournament #/m;
const WPN_HEADER = /^Game Hand #\d+ - Tournament #\d+ - /m;
// PS-семья: PokerStars, Chico, PokerPlanets и Sisal пишут раздачи в одном формате.
// Отличается только токен рума в шапке и форма ссылки на турнир: PS/Chico/Sisal —
// "Tournament #id", PokerPlanets — "Tournament (Название)#id". Обе накрываем "Tournament [#(]".
const PS_HEADER = /^(?:PokerStars|PokerPlanets|Sisal) (?:Hand|Game) #\d+: Tournament [#(]/m;
const WINAMAX_HEADER = /^Winamax Poker - Tournament /m;
const POKER888_HEADER = /^\*\*\*\*\* 888poker Hand History /m;
const IPOKER_HEADER = /<game\s+gamecode="\d+">/; // XML-формат iPoker; турнир — по <tournamentcode>

const VALID_CARD = /^[2-9TJQKA][shdc]$/;

// Санитайзер борда снимка: оставляем только валидные карты, убираем ДУБЛИ (ран-ит-твайс
// или повторные Dealing-строки в 888/iPoker склеивают борд с повторами) и лишние карты
// сверх 5. Без этого мусорный борд (>5 карт с дублями) уходил в промпт целиком (строка
// «Борд:» в hand-analysis.ts) и рассинхронивался с поулично нарезанными фактами → тренер
// строил разбор на выдуманной доске (баг реального тестера 12.07: борд «J-5-J-T» с
// апелляцией к картам, которых там нет). Правило 1/2: лучше чистый борд, чем противоречивый.
// Чистая функция; экспортируется для теста.
export function sanitizeBoard(board: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of board) {
    if (!VALID_CARD.test(c)) continue; // битый токен
    if (seen.has(c)) continue; // дубль (одна и та же карта борда встречена дважды)
    seen.add(c);
    out.push(c);
    if (out.length === 5) break; // борд не длиннее ривера (5 карт)
  }
  return out;
}

// Единая пост-проверка для ВСЕХ румов: чистим борд каждой раздачи перед выдачей в разбор.
function sanitizeParsedBoards(result: ParseResult): ParseResult {
  if (!result.ok) return result;
  for (const hand of result.data.hands) {
    const raw = hand.tableSnapshot.board;
    const clean = sanitizeBoard(raw);
    if (clean.length !== raw.length || clean.some((c, i) => c !== raw[i])) {
      hand.tableSnapshot.board = clean;
    }
  }
  return result;
}

export function parseHandHistory(buffer: Buffer): ParseResult {
  // BOM (PokerPlanets шлёт UTF-8 с BOM) сбил бы якорь ^ на первой раздаче — срезаем.
  const text = buffer.toString("utf-8").replace(/^\uFEFF/, "");

  if (WPN_HEADER.test(text)) return sanitizeParsedBoards(parseWpnMtt(buffer));
  if (GG_HEADER.test(text)) return sanitizeParsedBoards(parseGGPokerMtt(buffer));
  if (PS_HEADER.test(text)) return sanitizeParsedBoards(parsePokerStarsMtt(buffer));
  if (WINAMAX_HEADER.test(text)) return sanitizeParsedBoards(parseWinamaxMtt(buffer));
  if (POKER888_HEADER.test(text)) return sanitizeParsedBoards(parse888Mtt(buffer));
  if (IPOKER_HEADER.test(text) && /<tournamentcode>/.test(text))
    return sanitizeParsedBoards(parseIpokerMtt(buffer));

  return {
    ok: false,
    error: {
      type: "UNSUPPORTED_FORMAT",
      message:
        "Формат файла не распознан. Поддерживаются GGPoker, PokerStars / Chico / PokerPlanets / Sisal, Winamax, 888poker, ACR / PokerKing (WPN) и iPoker.",
    },
  };
}

// Дешёвый «нюх» ключа турнира из заголовка — без полного разбора. Нужен пакетной
// загрузке, чтобы сгруппировать и склеить файлы ОДНОГО турнира. Возвращаем ключ
// ТОЛЬКО для румов, которые пишут турнир несколькими файлами — сейчас это WPN
// (ACR/PokerKing: один файл на стол, при балансировке игрока пересаживают). GG и
// прочие пишут турнир одним файлом — их НЕ группируем (иначе случайно слитый
// дубль-файл удвоил бы раздачи; дедуп таких ловит обычная дедупликация турниров).
// WPN (ACR/PokerKing): один файл на стол. PS-семья (PokerStars/Chico/PokerPlanets) и
// iPoker — тоже многостольные: один турнир разбит на файлы по столам. Группируем их по
// (площадка+номер турнира). GG пишет турнир одним файлом — его НЕ группируем.
const WPN_KEY = /^Game Hand #\d+ - Tournament #(\d+)/m;
const PS_KEY = /^(?:PokerStars|Sisal) (?:Hand|Game) #\d+: Tournament #(\d+)/m;
// PokerPlanets: номер турнира стоит после метки в скобках — "Tournament (Название)#id".
const POKERPLANETS_KEY = /^PokerPlanets (?:Hand|Game) #\d+: Tournament \(.+?\)#(\d+)/m;
const WINAMAX_KEY = /^Table: '.*\((\d+)\)#[^']*'/m; // номер турнира в имени стола Winamax
const POKER888_KEY = /^Tournament #(\d+) /m;
const IPOKER_KEY = /<tournamentcode>(\d+)<\/tournamentcode>/;

export function sniffTournamentKey(buffer: Buffer): { room: string; tournamentId: string } | null {
  const text = buffer.toString("utf-8").replace(/^\uFEFF/, "");
  const wpn = WPN_KEY.exec(text);
  if (wpn) return { room: "WPN", tournamentId: wpn[1] };
  const ps = PS_KEY.exec(text);
  if (ps) return { room: "PS", tournamentId: ps[1] };
  const pplanets = POKERPLANETS_KEY.exec(text);
  if (pplanets) return { room: "PokerPlanets", tournamentId: pplanets[1] };
  const winamax = WINAMAX_KEY.exec(text);
  if (winamax) return { room: "Winamax", tournamentId: winamax[1] };
  const p888 = POKER888_KEY.exec(text);
  if (p888) return { room: "888poker", tournamentId: p888[1] };
  const ipoker = IPOKER_KEY.exec(text);
  if (ipoker) return { room: "iPoker", tournamentId: ipoker[1] };
  return null;
}

export { diagnoseParse } from "./diagnose";
export type { ParseAnomaly } from "./diagnose";
export { parseGGPokerMtt } from "./ggpoker";
export { parseWpnMtt } from "./wpn";
export { parsePokerStarsMtt } from "./ps";
export { parseIpokerMtt } from "./ipoker";
export { parseWinamaxMtt } from "./winamax";
export { parse888Mtt } from "./poker888";

import type { ParseResult } from "../types";
import { assignImportanceLevels, computePostflopAggressionFactor, diagnoseStyle } from "../ggpoker/classify";
import { opponentTokenizer, assignOpponentTokens } from "../shared/opponent-tokens";
import { assignShownCards, shownCardsByNick } from "../shared/shown-cards";
import { parseHand } from "./hand";

// 888poker: заголовок "***** 888poker Hand History for Game <id> *****", дальше
// "Tournament #<id> $20 + $2 - Table #N M Max". Названия турнира НЕТ (только бай-ин).
// Герой по "Dealt to". Дата формата "*** DD MM YYYY HH:MM:SS".
const HAND_HEADER = /^\*\*\*\*\* 888poker Hand History /m;
const HAND_SPLIT = /^(?=\*\*\*\*\* 888poker Hand History for Game )/m;
const GAME_ID = /^\*\*\*\*\* 888poker Hand History for Game (\d+) \*\*\*\*\*/; // дедуп при склейке столов
const TOURNAMENT_META = /^Tournament #(\d+) (.+?) - Table #/m;
const HAND_TIMESTAMP = /\*\*\* (\d{2}) (\d{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2})/g;
const DEALT_TO = /^Dealt to (.+?) \[/m;
const FLOP_MARK = /^\*\* Dealing flop \*\*/m;

const ROOM = "888poker";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function earliestPlayedAt(text: string): string | null {
  let min = Infinity;
  for (const m of text.matchAll(HAND_TIMESTAMP)) {
    const [, d, mo, y, h, mi, s] = m;
    const ts = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
    if (ts < min) min = ts;
  }
  return min === Infinity ? null : new Date(min).toISOString();
}

function parseHands(text: string): string[] {
  return text.split(HAND_SPLIT).filter((h) => h.trim().length > 0);
}

// Префлоп — до "** Dealing flop **".
function preflopSegment(hand: string): string {
  const flopIdx = hand.search(FLOP_MARK);
  return flopIdx === -1 ? hand : hand.slice(0, flopIdx);
}

// Момент ОДНОЙ раздачи (первый таймстемп в её заголовке) — для порядка «до текущей»
// при профиле оппонента. UTC, как и earliestPlayedAt.
function handPlayedAt(handText: string): string | null {
  const m = /\*\*\* (\d{2}) (\d{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2})/.exec(handText);
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString();
}

// Карта место → сырой ник из Seat-строк раздачи. Ник используется ТОЛЬКО локально
// для присвоения обезличенного псевдонима и в вывод парсера НЕ попадает.
const SEAT_NAME_LINE = /^Seat (\d+): (.+?) \(\s*[\d,]+\s*\)$/gm;
function seatNamesOf(handText: string): Record<number, string> {
  const out: Record<number, string> = {};
  for (const m of handText.matchAll(SEAT_NAME_LINE)) out[+m[1]] = m[2];
  return out;
}

export function parse888Mtt(buffer: Buffer): ParseResult {
  const text = buffer.toString("utf-8").replace(/\r\n?/g, "\n");

  if (!HAND_HEADER.test(text)) {
    return {
      ok: false,
      error: { type: "UNSUPPORTED_FORMAT", message: "Загрузи турнир 888poker" },
    };
  }

  const metaMatch = TOURNAMENT_META.exec(text);
  if (!metaMatch) {
    return {
      ok: false,
      error: { type: "PARSE_FAILED", message: "Не удалось прочитать номер турнира" },
    };
  }
  const externalTournamentId = metaMatch[1];
  const name = metaMatch[2].trim(); // напр. "$20 + $2"
  const playedAt = earliestPlayedAt(text);

  const heroName = DEALT_TO.exec(text)?.[1] ?? null;
  if (!heroName) {
    return {
      ok: false,
      error: { type: "PARSE_FAILED", message: "Не удалось определить героя (нет строки «Dealt to»)" },
    };
  }

  const heroSeatRe = new RegExp("^Seat \\d+: " + escapeRe(heroName) + " \\(", "m");
  const heroStackRe = new RegExp("^Seat \\d+: " + escapeRe(heroName) + " \\(\\s*([\\d,]+)", "m");
  const heroVoluntaryRe = new RegExp("^" + escapeRe(heroName) + " (?:calls|bets|raises) \\[", "m");
  const heroRaiseRe = new RegExp("^" + escapeRe(heroName) + " raises \\[", "m");

  const seenIds = new Set<string>();
  const dealtHands = parseHands(text)
    .filter((h) => heroSeatRe.test(h))
    .filter((h) => {
      const id = GAME_ID.exec(h)?.[1];
      if (!id) return true;
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
  const handsCount = dealtHands.length;

  if (handsCount === 0) {
    return {
      ok: false,
      error: { type: "PARSE_FAILED", message: "Файл не содержит раздач с участием героя" },
    };
  }

  const vpipHands = dealtHands.filter((h) => heroVoluntaryRe.test(preflopSegment(h))).length;
  const vpipPercent = Math.round((vpipHands / handsCount) * 10000) / 100;

  const pfrHands = dealtHands.filter((h) => heroRaiseRe.test(preflopSegment(h))).length;
  const pfrPercent = Math.round((pfrHands / handsCount) * 10000) / 100;

  const snapshots = dealtHands.map((h) => parseHand(h, heroName));
  const tokenFor = opponentTokenizer();
  // Псевдонимы и ВСКРЫТЫЕ КАРТЫ — ДО классификации: детекторы кулера и доезда читают
  // seat.shownCards (при старом порядке оба молчали — баг найден аудитом 2026-07-05).
  snapshots.forEach((snapshot, index) => {
    const namesBySeat = seatNamesOf(dealtHands[index]);
    assignOpponentTokens(snapshot.tableSnapshot.seats, namesBySeat, tokenFor);
    assignShownCards(snapshot.tableSnapshot.seats, namesBySeat, shownCardsByNick(dealtHands[index]));
  });
  const importanceLevels = assignImportanceLevels(snapshots);
  const hands = snapshots.map((snapshot, index) => ({
    ...snapshot,
    importanceLevel: importanceLevels[index],
    playedAt: handPlayedAt(dealtHands[index]),
  }));

  const postflopAggressionFactor = Math.round(computePostflopAggressionFactor(snapshots) * 100) / 100;
  const styleDiagnosis = diagnoseStyle(vpipPercent, pfrPercent, postflopAggressionFactor);

  // Бай-ин 888 — в $, не в фишках → результат в стартовых стеках.
  const stackOf = (hand: string): number | null => {
    const m = heroStackRe.exec(hand);
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
  };
  const firstStack = stackOf(dealtHands[0]);
  const lastStack = stackOf(dealtHands[dealtHands.length - 1]);
  const startingStack = firstStack ?? 1;
  const netChips = lastStack !== null ? lastStack - (firstStack ?? lastStack) : 0;
  const resultBuyins = Math.round((netChips / (startingStack || 1)) * 100) / 100;

  return {
    ok: true,
    data: {
      room: ROOM,
      externalTournamentId,
      name,
      playedAt: playedAt ?? new Date().toISOString(),
      handsCount,
      vpipPercent,
      pfrPercent,
      postflopAggressionFactor,
      resultBuyins,
      styleDiagnosis,
      hands,
    },
  };
}

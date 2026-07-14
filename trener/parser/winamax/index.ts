import type { ParseResult } from "../types";
import { assignImportanceLevels, computePostflopAggressionFactor, diagnoseStyle } from "../ggpoker/classify";
import { opponentTokenizer, assignOpponentTokens } from "../shared/opponent-tokens";
import { assignShownCards, shownCardsByNick } from "../shared/shown-cards";
import { assignCollected, collectedByNick } from "../shared/collected";
import { parseHand } from "./hand";

// Winamax: заголовок "Winamax Poker - Tournament \"Имя\" buyIn: 18€ + 2€ level: N -
// HandId: #... - Holdem no limit (ante/sb/bb) - дата UTC". Номер турнира в заголовке
// НЕТ — он в имени стола: "Table: 'Имя(<id>)#<стол>'". Герой по "Dealt to".
const HAND_HEADER = /^Winamax Poker - Tournament /m;
const HAND_SPLIT = /^(?=Winamax Poker - Tournament )/m;
const TOURNAMENT_NAME = /^Winamax Poker - Tournament "(.+?)" /m;
const TOURNAMENT_ID = /^Table: '.*\((\d+)\)#[^']*'/m;
const HAND_ID = /HandId: #(\S+) -/; // уникальный id раздачи — для дедупа при склейке столов
const HAND_TIMESTAMP = /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/g;
const DEALT_TO = /^Dealt to (.+?) \[/m;
const PRE_FLOP = /^\*\*\* PRE-FLOP \*\*\*/m;
const FLOP_START = /^\*\*\* FLOP \*\*\*/m;

const ROOM = "Winamax";

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function earliestPlayedAt(text: string): string | null {
  let min = Infinity;
  for (const m of text.matchAll(HAND_TIMESTAMP)) {
    const [, y, mo, d, h, mi, s] = m;
    const ts = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
    if (ts < min) min = ts;
  }
  return min === Infinity ? null : new Date(min).toISOString();
}

function parseHands(text: string): string[] {
  return text.split(HAND_SPLIT).filter((h) => h.trim().length > 0);
}

// Префлоп Winamax — между "*** PRE-FLOP ***" и "*** FLOP ***" (добровольный вход тут).
function preflopSegment(hand: string): string {
  const preIdx = hand.search(PRE_FLOP);
  const flopIdx = hand.search(FLOP_START);
  const start = preIdx === -1 ? 0 : preIdx;
  return flopIdx === -1 ? hand.slice(start) : hand.slice(start, flopIdx);
}

// Момент ОДНОЙ раздачи (первый таймстемп в её заголовке) — для порядка «до текущей»
// при профиле оппонента. UTC, как и earliestPlayedAt.
function handPlayedAt(handText: string): string | null {
  const m = /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(handText);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString();
}

// Карта место → сырой ник из Seat-строк раздачи. Ник используется ТОЛЬКО локально
// для присвоения обезличенного псевдонима и в вывод парсера НЕ попадает.
const SEAT_NAME_LINE = /^Seat (\d+): (.+?) \(([\d,]+)(?:,[^)]*)?\)$/gm;
function seatNamesOf(handText: string): Record<number, string> {
  const out: Record<number, string> = {};
  for (const m of handText.matchAll(SEAT_NAME_LINE)) out[+m[1]] = m[2];
  return out;
}

export function parseWinamaxMtt(buffer: Buffer): ParseResult {
  const text = buffer.toString("utf-8").replace(/\r\n?/g, "\n");

  if (!HAND_HEADER.test(text)) {
    return {
      ok: false,
      error: { type: "UNSUPPORTED_FORMAT", message: "Загрузи турнир Winamax" },
    };
  }

  const externalTournamentId = TOURNAMENT_ID.exec(text)?.[1];
  if (!externalTournamentId) {
    return {
      ok: false,
      error: { type: "PARSE_FAILED", message: "Не удалось прочитать номер турнира из имени стола" },
    };
  }
  const name = TOURNAMENT_NAME.exec(text)?.[1]?.trim() ?? `Турнир #${externalTournamentId}`;
  const playedAt = earliestPlayedAt(text);

  const heroName = DEALT_TO.exec(text)?.[1] ?? null;
  if (!heroName) {
    return {
      ok: false,
      error: { type: "PARSE_FAILED", message: "Не удалось определить героя (нет строки «Dealt to»)" },
    };
  }

  const heroSeatRe = new RegExp("^Seat \\d+: " + escapeRe(heroName) + " \\(", "m");
  const heroStackRe = new RegExp("^Seat \\d+: " + escapeRe(heroName) + " \\(([\\d,]+)", "m");
  const heroVoluntaryRe = new RegExp("^" + escapeRe(heroName) + " (?:calls|bets|raises)", "m");
  const heroRaiseRe = new RegExp("^" + escapeRe(heroName) + " raises", "m");

  const seenHandIds = new Set<string>();
  const dealtHands = parseHands(text)
    .filter((h) => heroSeatRe.test(h))
    .filter((h) => {
      const id = HAND_ID.exec(h)?.[1];
      if (!id) return true;
      if (seenHandIds.has(id)) return false;
      seenHandIds.add(id);
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
    assignCollected(snapshot.tableSnapshot.seats, namesBySeat, collectedByNick(dealtHands[index]));
  });
  const importanceLevels = assignImportanceLevels(snapshots);
  const hands = snapshots.map((snapshot, index) => ({
    ...snapshot,
    importanceLevel: importanceLevels[index],
    playedAt: handPlayedAt(dealtHands[index]),
  }));

  const postflopAggressionFactor = Math.round(computePostflopAggressionFactor(snapshots) * 100) / 100;
  const styleDiagnosis = diagnoseStyle(vpipPercent, pfrPercent, postflopAggressionFactor);

  // Бай-ин Winamax — в евро, не в фишках → результат меряем в стартовых стеках.
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

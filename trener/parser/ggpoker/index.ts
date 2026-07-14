import type { ParseResult } from "../types";
import { assignImportanceLevels, computePostflopAggressionFactor, diagnoseStyle } from "./classify";
import { assignShownCards, shownCardsByNick } from "../shared/shown-cards";
import { assignCollected, collectedByNick } from "../shared/collected";
import { parseHand } from "./hand";

const HAND_HEADER = /^Poker Hand #(?:RC-GGPoker-\d{8}-\d+|TM\d+): Tournament #/m;
const HAND_SPLIT = /^(?=Poker Hand #(?:RC-GGPoker-\d{8}-|TM\d+))/m;
const HERO_SEAT = /^Seat \d+: Hero \((\d+) in chips\)/m;
const DEALT_TO_HERO = /^\*\*\* HOLE CARDS \*\*\*/m;
const PREFLOP_VOLUNTARY = /^Hero: (?:calls|raises|bets)/m;
const PREFLOP_RAISE = /^Hero: raises/m;
const FLOP_START = /^\*\*\* FLOP \*\*\*/m;
const BUY_IN_FROM_HEADER = /\$(\d+(?:\.\d+)?)\+\$/;

// Номер турнира и его название из заголовка раздачи: "... Tournament #289598162, <название> - Level..."
const TOURNAMENT_META = /Tournament #(\d+), (.+?) - Level/;
// Момент раздачи в конце заголовка: "... - 2026/06/11 20:20:56" (все раздачи турнира, берём минимум)
const HAND_TIMESTAMP = /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/g;

const ROOM = "GGPoker";

function isMttFile(text: string): boolean {
  return HAND_HEADER.test(text);
}

// Самый ранний таймстемп среди всех раздач = момент, когда турнир игрался.
// Строим Date в UTC из компонентов файла — без сдвига часовым поясом сервера
// (на экране показываем тоже в UTC, чтобы дата совпадала с файлом).
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

// Момент ОДНОЙ раздачи (первый таймстемп в её заголовке) — для порядка «до текущей»
// при профиле оппонента. UTC, как и earliestPlayedAt.
function handPlayedAt(handText: string): string | null {
  const m = /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(handText);
  if (!m) return null;
  const [, y, mo, d, h, mi, s] = m;
  return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString();
}

// Карта место → сырой ник из строк «Seat N: <ник> (... in chips)». Ник используется
// ТОЛЬКО локально для присвоения обезличенного псевдонима и в вывод парсера НЕ попадает.
const SEAT_NAME_LINE = /^Seat (\d+): (\S+) \([\d,]+ in chips\)/gm;
function seatNamesOf(handText: string): Record<number, string> {
  const out: Record<number, string> = {};
  for (const m of handText.matchAll(SEAT_NAME_LINE)) out[+m[1]] = m[2];
  return out;
}

function heroStack(hand: string): number | null {
  const m = HERO_SEAT.exec(hand);
  return m ? parseInt(m[1], 10) : null;
}

function preflopSegment(hand: string): string {
  const flopIdx = hand.search(FLOP_START);
  const holeIdx = hand.search(DEALT_TO_HERO);
  return flopIdx === -1 ? hand.slice(holeIdx) : hand.slice(holeIdx, flopIdx);
}

function heroPlayedPreflop(hand: string): boolean {
  if (!DEALT_TO_HERO.test(hand)) return false;
  return PREFLOP_VOLUNTARY.test(preflopSegment(hand));
}

function heroRaisedPreflop(hand: string): boolean {
  if (!DEALT_TO_HERO.test(hand)) return false;
  return PREFLOP_RAISE.test(preflopSegment(hand));
}

function buyInSize(text: string): number {
  const m = BUY_IN_FROM_HEADER.exec(text);
  return m ? parseFloat(m[1]) : 1;
}

export function parseGGPokerMtt(buffer: Buffer): ParseResult {
  const text = buffer.toString("utf-8");

  if (!isMttFile(text)) {
    return {
      ok: false,
      error: { type: "UNSUPPORTED_FORMAT", message: "Загрузи MTT-турнир GGPoker" },
    };
  }

  const metaMatch = TOURNAMENT_META.exec(text);
  if (!metaMatch) {
    return {
      ok: false,
      error: { type: "PARSE_FAILED", message: "Не удалось прочитать номер и название турнира" },
    };
  }
  const externalTournamentId = metaMatch[1];
  const name = metaMatch[2].trim();
  const playedAt = earliestPlayedAt(text);

  const rawHands = parseHands(text);
  const dealtHands = rawHands.filter((h) => DEALT_TO_HERO.test(h));
  const handsCount = dealtHands.length;

  if (handsCount === 0) {
    return {
      ok: false,
      error: { type: "PARSE_FAILED", message: "Файл не содержит раздач с участием Hero" },
    };
  }

  const vpipHands = dealtHands.filter(heroPlayedPreflop).length;
  const vpipPercent = Math.round((vpipHands / handsCount) * 10000) / 100;

  const pfrHands = dealtHands.filter(heroRaisedPreflop).length;
  const pfrPercent = Math.round((pfrHands / handsCount) * 10000) / 100;

  const snapshots = dealtHands.map(parseHand);
  // Обезличенные СТАБИЛЬНЫЕ псевдонимы оппонентов в рамках турнира: сырой ник → "oppN"
  // (один и тот же человек — один псевдоним во всех его раздачах). Ник живёт только здесь,
  // в вывод парсера попадает лишь псевдоним (parser/opponent-profile склеивает по нему).
  const nickToToken = new Map<string, string>();
  const tokenFor = (nick: string): string => {
    const existing = nickToToken.get(nick);
    if (existing) return existing;
    const token = `opp${nickToToken.size + 1}`;
    nickToToken.set(nick, token);
    return token;
  };

  // Псевдонимы и ВСКРЫТЫЕ КАРТЫ подшиваются ДО классификации: детекторы кулера и
  // доезда читают seat.shownCards — при старом порядке (классификация раньше вскрытия)
  // оба детектора молчали на этапе разметки (баг найден аудитом 2026-07-05).
  snapshots.forEach((snapshot, index) => {
    const names = seatNamesOf(dealtHands[index]); // сырые ники — только локально
    for (const seat of snapshot.tableSnapshot.seats) {
      const nick = seat.seatNumber != null ? names[seat.seatNumber] : undefined;
      if (seat.label !== "Hero" && nick) seat.opponentToken = tokenFor(nick);
    }
    assignShownCards(snapshot.tableSnapshot.seats, names, shownCardsByNick(dealtHands[index]));
    assignCollected(snapshot.tableSnapshot.seats, names, collectedByNick(dealtHands[index]));
  });

  const importanceLevels = assignImportanceLevels(snapshots);
  const hands = snapshots.map((snapshot, index) => ({
    ...snapshot,
    importanceLevel: importanceLevels[index],
    playedAt: handPlayedAt(dealtHands[index]),
  }));

  const postflopAggressionFactor = Math.round(computePostflopAggressionFactor(snapshots) * 100) / 100;
  const styleDiagnosis = diagnoseStyle(vpipPercent, pfrPercent, postflopAggressionFactor);

  const firstStack = heroStack(dealtHands[0]);
  const lastStack = heroStack(dealtHands[dealtHands.length - 1]);
  const startingStack = firstStack ?? 1;
  const bi = buyInSize(text);
  const chipsPerBi = startingStack / bi || startingStack;
  const netChips = lastStack !== null ? lastStack - (firstStack ?? lastStack) : 0;
  const resultBuyins = Math.round((netChips / chipsPerBi) * 100) / 100;

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

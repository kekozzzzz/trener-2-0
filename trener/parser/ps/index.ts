import type { ParseResult } from "../types";
import { assignImportanceLevels, computePostflopAggressionFactor, diagnoseStyle } from "../ggpoker/classify";
import { opponentTokenizer, assignOpponentTokens } from "../shared/opponent-tokens";
import { assignShownCards, shownCardsByNick } from "../shared/shown-cards";
import { parseHand } from "./hand";

// PS-семья: PokerStars и Chico пишут раздачи в одном формате. Chico отличается
// только префиксом стола (CHC_) и отсутствием римских цифр в Level — на разбор не
// влияет, метим лишь room по имени стола.
const HAND_HEADER = /^PokerStars (?:Hand|Game) #\d+: Tournament #/m;
const HAND_SPLIT = /^(?=PokerStars (?:Hand|Game) #\d+: Tournament #)/m;
const TOURNAMENT_META = /Tournament #(\d+), (.+?) - Level/;
const HAND_TIMESTAMP = /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/g;
const TABLE_NAME = /^Table '(.+?)'/m;
const HOLE_CARDS = /^\*\*\* HOLE CARDS \*\*\*/m;
const DEALT_TO = /^Dealt to (.+?) \[/m; // карты показаны только у героя → так находим его ник
const FLOP_START = /^\*\*\* FLOP \*\*\*/m;
const HAND_ID = /^PokerStars (?:Hand|Game) #(\d+):/; // номер раздачи — для дедупа при склейке файлов
const BUY_IN_FROM_HEADER = /\$(\d+(?:\.\d+)?)\+\$/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Chico пишет стол как 'CHC_<id> <n>'. Префикс отличает Chico от настоящего
// PokerStars — больше различий, влияющих на разбор, нет.
function detectRoom(text: string): string {
  const table = TABLE_NAME.exec(text)?.[1] ?? "";
  return table.startsWith("CHC_") ? "Chico" : "PokerStars";
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

function preflopSegment(hand: string): string {
  const flopIdx = hand.search(FLOP_START);
  const holeIdx = hand.search(HOLE_CARDS);
  return flopIdx === -1 ? hand.slice(holeIdx) : hand.slice(holeIdx, flopIdx);
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
const SEAT_NAME_LINE = /^Seat (\d+): (.+?) \([\d,]+ in chips[^)]*\)/gm;
function seatNamesOf(handText: string): Record<number, string> {
  const out: Record<number, string> = {};
  for (const m of handText.matchAll(SEAT_NAME_LINE)) out[+m[1]] = m[2];
  return out;
}

export function parsePokerStarsMtt(buffer: Buffer): ParseResult {
  // Нормализуем переводы строк: реальные экспорты идут с CRLF, а построчные
  // парсеры действий (parseVerb с якорем $ без флага m) на хвостовой \r не матчат.
  const text = buffer.toString("utf-8").replace(/\r\n?/g, "\n");

  if (!HAND_HEADER.test(text)) {
    return {
      ok: false,
      error: { type: "UNSUPPORTED_FORMAT", message: "Загрузи турнир PokerStars / Chico" },
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
  const name = metaMatch[2].trim(); // напр. "$2.20+$0.20 USD Hold'em No Limit"
  const playedAt = earliestPlayedAt(text);
  const room = detectRoom(text);

  const heroName = DEALT_TO.exec(text)?.[1] ?? null;
  if (!heroName) {
    return {
      ok: false,
      error: { type: "PARSE_FAILED", message: "Не удалось определить героя (нет строки «Dealt to»)" },
    };
  }

  const heroSeatRe = new RegExp("^Seat \\d+: " + escapeRe(heroName) + " \\(", "m");
  const heroStackRe = new RegExp("^Seat \\d+: " + escapeRe(heroName) + " \\(([\\d,]+) in chips", "m");
  const heroVoluntaryRe = new RegExp("^" + escapeRe(heroName) + ": (?:calls|bets|raises)", "m");
  const heroRaiseRe = new RegExp("^" + escapeRe(heroName) + ": raises", "m");

  // Дедуп раздач по номеру: при склейке многостольных файлов одного турнира
  // случайный повтор/перекрытие файла не должен удвоить раздачи.
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
  const importanceLevels = assignImportanceLevels(snapshots);
  const tokenFor = opponentTokenizer();
  const hands = snapshots.map((snapshot, index) => {
    const namesBySeat = seatNamesOf(dealtHands[index]);
    assignOpponentTokens(snapshot.tableSnapshot.seats, namesBySeat, tokenFor);
    assignShownCards(snapshot.tableSnapshot.seats, namesBySeat, shownCardsByNick(dealtHands[index]));
    return {
      ...snapshot,
      importanceLevel: importanceLevels[index],
      playedAt: handPlayedAt(dealtHands[index]),
    };
  });

  const postflopAggressionFactor = Math.round(computePostflopAggressionFactor(snapshots) * 100) / 100;
  const styleDiagnosis = diagnoseStyle(vpipPercent, pfrPercent, postflopAggressionFactor);

  const stackOf = (hand: string): number | null => {
    const m = heroStackRe.exec(hand);
    return m ? parseInt(m[1].replace(/,/g, ""), 10) : null;
  };
  const firstStack = stackOf(dealtHands[0]);
  const lastStack = stackOf(dealtHands[dealtHands.length - 1]);
  const startingStack = firstStack ?? 1;
  const biMatch = BUY_IN_FROM_HEADER.exec(text);
  const bi = biMatch ? parseFloat(biMatch[1]) : 1;
  const chipsPerBi = startingStack / bi || startingStack;
  const netChips = lastStack !== null ? lastStack - (firstStack ?? lastStack) : 0;
  const resultBuyins = Math.round((netChips / chipsPerBi) * 100) / 100;

  return {
    ok: true,
    data: {
      room,
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

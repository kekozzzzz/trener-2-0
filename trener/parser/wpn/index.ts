import type { ParseResult } from "../types";
import { assignImportanceLevels, computePostflopAggressionFactor, diagnoseStyle } from "../ggpoker/classify";
import { parseHand } from "./hand";

// WPN (Winning Poker Network): ACR / PokerKing. Один формат на всю сеть.
// Заголовок: "Game Hand #N - Tournament #N - Holdem (No Limit) - Level X (sb/bb) - дата UTC".
const HAND_HEADER = /^Game Hand #\d+ - Tournament #\d+ - /m;
const HAND_SPLIT = /^(?=Game Hand #\d+ - Tournament #)/m;
// У WPN в заголовке НЕТ названия турнира — только тип игры. Берём его как имя + номер.
const TOURNAMENT_META = /^Game Hand #\d+ - Tournament #(\d+) - (.+?) - Level/m;
const HAND_TIMESTAMP = /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2})/g;
const HOLE_CARDS = /^\*\*\* HOLE CARDS \*\*\*/m;
const DEALT_TO = /^Dealt to (.+?) \[/m; // карты показаны только у героя → так и находим его ник
const FLOP_START = /^\*\*\* FLOP \*\*\*/m;
const HAND_ID = /^Game Hand #(\d+)/; // номер раздачи — для дедупа при склейке файлов

const ROOM = "WPN"; // сеть (ACR/PokerKing); скин из файла не определить — метим сетью

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

function preflopSegment(hand: string): string {
  const flopIdx = hand.search(FLOP_START);
  const holeIdx = hand.search(HOLE_CARDS);
  return flopIdx === -1 ? hand.slice(holeIdx) : hand.slice(holeIdx, flopIdx);
}

export function parseWpnMtt(buffer: Buffer): ParseResult {
  const text = buffer.toString("utf-8");

  if (!HAND_HEADER.test(text)) {
    return {
      ok: false,
      error: { type: "UNSUPPORTED_FORMAT", message: "Загрузи турнир ACR / PokerKing (WPN)" },
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
  const name = `${metaMatch[2].trim()} #${externalTournamentId}`; // напр. "Holdem (No Limit) #34811363"
  const playedAt = earliestPlayedAt(text);

  const heroName = DEALT_TO.exec(text)?.[1] ?? null;
  if (!heroName) {
    return {
      ok: false,
      error: { type: "PARSE_FAILED", message: "Не удалось определить героя (нет строки «Dealt to»)" },
    };
  }

  const heroSeatRe = new RegExp("^Seat \\d+: " + escapeRe(heroName) + " \\(", "m");
  const heroStackRe = new RegExp("^Seat \\d+: " + escapeRe(heroName) + " \\(([\\d,.]+)\\)", "m");
  const heroVoluntaryRe = new RegExp("^" + escapeRe(heroName) + " (?:calls|bets|raises)", "m");
  const heroRaiseRe = new RegExp("^" + escapeRe(heroName) + " raises", "m");

  // Дедуп раздач по номеру (Game Hand #N): при склейке многостольных файлов одного
  // турнира случайный повтор/перекрытие файла не должен удвоить раздачи.
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
  const hands = snapshots.map((snapshot, index) => ({
    ...snapshot,
    importanceLevel: importanceLevels[index],
  }));

  const postflopAggressionFactor = Math.round(computePostflopAggressionFactor(snapshots) * 100) / 100;
  const styleDiagnosis = diagnoseStyle(vpipPercent, pfrPercent, postflopAggressionFactor);

  // Бай-ина в заголовке WPN нет → результат в бай-инах не вычисляем (поле не показывается,
  // см. plans/2026-06-20). Считаем по фишкам с bi=1, как GG в отсутствие бай-ина.
  const stackOf = (hand: string): number | null => {
    const m = heroStackRe.exec(hand);
    return m ? Math.round(parseFloat(m[1].replace(/,/g, ""))) : null;
  };
  const firstStack = stackOf(dealtHands[0]);
  const lastStack = stackOf(dealtHands[dealtHands.length - 1]);
  const startingStack = firstStack ?? 1;
  const netChips = lastStack !== null ? lastStack - (firstStack ?? lastStack) : 0;
  const resultBuyins = Math.round((netChips / startingStack) * 100) / 100;

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

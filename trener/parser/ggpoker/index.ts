import type { ParseResult } from "../types";

const HAND_HEADER = /^Poker Hand #RC-GGPoker-\d{8}-\d+: Tournament #/m;
const HAND_SPLIT = /^(?=Poker Hand #RC-GGPoker-)/m;
const HERO_SEAT = /^Seat \d+: Hero \((\d+) in chips\)/m;
const DEALT_TO_HERO = /^\*\*\* HOLE CARDS \*\*\*/m;
const PREFLOP_VOLUNTARY = /^Hero: (?:calls|raises|bets)/m;
const FLOP_START = /^\*\*\* FLOP \*\*\*/m;
const BUY_IN_FROM_HEADER = /\$(\d+(?:\.\d+)?)\+\$/;

function isMttFile(text: string): boolean {
  return HAND_HEADER.test(text);
}

function parseHands(text: string): string[] {
  return text.split(HAND_SPLIT).filter((h) => h.trim().length > 0);
}

function heroStack(hand: string): number | null {
  const m = HERO_SEAT.exec(hand);
  return m ? parseInt(m[1], 10) : null;
}

function heroPlayedPreflop(hand: string): boolean {
  if (!DEALT_TO_HERO.test(hand)) return false;
  const flopIdx = hand.search(FLOP_START);
  const holeIdx = hand.search(DEALT_TO_HERO);
  const preflop = flopIdx === -1 ? hand.slice(holeIdx) : hand.slice(holeIdx, flopIdx);
  return PREFLOP_VOLUNTARY.test(preflop);
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

  const hands = parseHands(text);
  const dealtHands = hands.filter((h) => DEALT_TO_HERO.test(h));
  const handsCount = dealtHands.length;

  if (handsCount === 0) {
    return {
      ok: false,
      error: { type: "PARSE_FAILED", message: "Файл не содержит раздач с участием Hero" },
    };
  }

  const vpipHands = dealtHands.filter(heroPlayedPreflop).length;
  const vpipPercent = Math.round((vpipHands / handsCount) * 10000) / 100;

  const firstStack = heroStack(dealtHands[0]);
  const lastStack = heroStack(dealtHands[dealtHands.length - 1]);
  const startingStack = firstStack ?? 1;
  const bi = buyInSize(text);
  const chipsPerBi = startingStack / bi || startingStack;
  const netChips = lastStack !== null ? lastStack - (firstStack ?? lastStack) : 0;
  const resultBuyins = Math.round((netChips / chipsPerBi) * 100) / 100;

  return {
    ok: true,
    data: { handsCount, vpipPercent, resultBuyins },
  };
}

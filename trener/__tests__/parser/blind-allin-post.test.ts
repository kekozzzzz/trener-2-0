/**
 * Аудит румов 19.07: короткий игрок постит блайнд последними фишками — «posts big blind X and is
 * all-in». Румы помечали такой ВЫНУЖДЕННЫЙ пост как ALL_IN, из-за чего bigBlindFromSnapshot не
 * находил POST_BB, bb становился null — и из промпта МОЛЧА пропадала вся пачка фактов в больших
 * блайндах: стеки, зона стека, пороги пот-оддсов, вердикт префлоп-чарта и панель диапазонов.
 *
 * Пометка «ва-банк» на блайнде значит лишь, что стек меньше блайнда, — сам пост остаётся постом.
 */

import { describe, it, expect } from "vitest";
import { bigBlindFromSnapshot } from "@/parser/big-blind";
import { parsePokerStarsMtt } from "@/parser/ps";
import { parseWinamaxMtt } from "@/parser/winamax";
import { parseWpnMtt } from "@/parser/wpn";

// Минимальные раздачи в формате каждого рума, где BB уходит ва-банк самим блайндом.
const PS_HAND = `PokerStars Hand #1: Tournament #555, $5+$0.50 USD Hold'em No Limit - Level I (10/20) - 2026/01/01 12:00:00 ET
Table '555 1' 6-max Seat #1 is the button
Seat 1: Hero (1000 in chips)
Seat 2: ShortStack (15 in chips)
Hero: posts small blind 10
ShortStack: posts big blind 15 and is all-in
*** HOLE CARDS ***
Dealt to Hero [Ah Kd]
Hero: calls 5
*** SUMMARY ***
Total pot 30 | Rake 0
Seat 1: Hero (button) (small blind) collected (30)
`;

const WMX_HAND = `Winamax Poker - Tournament "Test" buyIn: 5€ + 0.50€ level: 1 - HandId: #1-1-1 - Holdem no limit (10/20) - 2026/01/01 12:00:00 UTC
Table: 'Test(555)#0' 6-max (real money) Seat #1 is the button
Seat 1: Hero (1000)
Seat 2: ShortStack (15)
Hero posts small blind 10
ShortStack posts big blind 15 and is all-in
*** PRE-FLOP ***
Dealt to Hero [Ah Kd]
Hero calls 5
*** SUMMARY ***
Total pot 30
Seat 1: Hero (button) won 30
`;

const WPN_HAND = `Game Hand #1 - Tournament #555 - Holdem (No Limit) - Level 1 (10/20) - 2026/01/01 12:00:00 UTC
Table '1' 6-max Seat #1 is the button
Seat 1: hero99 (1000)
Seat 2: ShortStack (15)
hero99 posts the small blind 10
ShortStack posts the big blind 15 and is all-in
*** HOLE CARDS ***
Dealt to hero99 [Ah Kd]
hero99 calls 5
hero99 collected 30 from pot
*** SUMMARY ***
Total pot 30
Seat 1: hero99 (button) won 30
`;

const rooms: [string, string, (b: Buffer) => ReturnType<typeof parsePokerStarsMtt>][] = [
  ["PokerStars/Chico", PS_HAND, parsePokerStarsMtt],
  ["Winamax", WMX_HAND, parseWinamaxMtt],
  ["WPN", WPN_HAND, parseWpnMtt],
];

describe("вынужденный пост блайнда ва-банк не съедает большой блайнд раздачи", () => {
  for (const [room, text, parse] of rooms) {
    it(`${room}: POST_BB сохраняется и bb определяется`, () => {
      const r = parse(Buffer.from(text, "utf8"));
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      const snapshot = r.data.hands[0].tableSnapshot;
      // Пост остался постом, а не превратился в ALL_IN.
      expect(snapshot.actions.some((a) => a.action === "POST_BB")).toBe(true);
      // И главное: блайнд раздачи известен, значит факты в BB не исчезают.
      expect(bigBlindFromSnapshot(snapshot)).toBe(15);
    });
  }
});

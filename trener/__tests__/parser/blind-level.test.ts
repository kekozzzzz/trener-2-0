/**
 * Аудит румов 19.07: уровень блайндов из заголовка HH парсил только GGPoker. У PokerStars,
 * Winamax и WPN поле оставалось пустым, и из промпта молча пропадала строка «Уровень блайндов
 * турнира» — тренер терял ориентир по стадии турнира.
 *
 * Заголовки у всех троих разные: PS пишет уровень РИМСКИМИ («Level IV»), Winamax — в поле
 * «level: 1», WPN — «Level 1 (10/20)».
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parsePokerStarsMtt } from "@/parser/ps";
import { parseWinamaxMtt } from "@/parser/winamax";
import { parseWpnMtt } from "@/parser/wpn";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "../fixtures", name));

describe("уровень блайндов читается из заголовка", () => {
  it("Winamax: «level: 1» в шапке раздачи", () => {
    const r = parseWinamaxMtt(fixture("winamax_mtt.txt"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.hands.map((h) => h.tableSnapshot.level)).toEqual([1, 1, 2]);
  });

  it("WPN: «- Level 1 (10/20) -»", () => {
    const r = parseWpnMtt(fixture("wpn_mtt.txt"));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.hands.map((h) => h.tableSnapshot.level)).toEqual([1, 1, 2]);
  });
});

describe("PokerStars — уровень римскими цифрами", () => {
  const hand = (lvl: string) =>
    Buffer.from(
      `PokerStars Hand #1: Tournament #555, $5+$0.50 USD Hold'em No Limit - Level ${lvl} (100/200) - 2026/01/01 12:00:00 UTC\n` +
        `Table '555 1' 6-max Seat #1 is the button\n` +
        `Seat 1: Hero (5000 in chips)\nSeat 2: Villain (5000 in chips)\n` +
        `Hero: posts small blind 100\nVillain: posts big blind 200\n` +
        `*** HOLE CARDS ***\nDealt to Hero [Ah Kd]\nHero: folds\n` +
        `*** SUMMARY ***\nTotal pot 300 | Rake 0\nSeat 2: Villain (big blind) collected (300)\n`,
      "utf8",
    );
  const levelOf = (lvl: string) => {
    const r = parsePokerStarsMtt(hand(lvl));
    return r.ok ? r.data.hands[0].tableSnapshot.level : null;
  };

  it("вычитающая пара римских цифр: IV = 4", () => expect(levelOf("IV")).toBe(4));
  it("составное число: XII = 12", () => expect(levelOf("XII")).toBe(12));
  it("единица: I = 1", () => expect(levelOf("I")).toBe(1));
  it("клоны формата пишут арабскими: 7 = 7", () => expect(levelOf("7")).toBe(7));

  it("уровня в заголовке нет — поле пустое, стадию НЕ выдумываем", () => {
    // Ровно случай нашей фикстуры: «- Level (100/200) -» без номера.
    expect(levelOf("")).toBeUndefined();
  });
});

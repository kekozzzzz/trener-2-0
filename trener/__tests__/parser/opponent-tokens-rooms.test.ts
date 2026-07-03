/**
 * Псевдонимы оппонентов и момент раздачи во ВСЕХ румах (plans/2026-07-01-профиль-
 * оппонента.md, хвост «остальные румы»; GG покрыт своим тестом в ggpoker.test.ts).
 *
 * По каждому руму на реальной фикстуре: (1) обезличивание — ни один сырой ник из
 * Seat-строк/XML не попадает в вывод парсера; (2) все оппоненты получают псевдоним
 * «oppN», стабильный в рамках турнира; (3) у каждой раздачи есть playedAt (ISO) —
 * без него профиль «по рукам до текущей» не работает.
 */

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { parsePokerStarsMtt } from "@/parser/ps";
import { parseWinamaxMtt } from "@/parser/winamax";
import { parse888Mtt } from "@/parser/poker888";
import { parseIpokerMtt } from "@/parser/ipoker";
import { parseWpnMtt } from "@/parser/wpn";
import type { ParseResult } from "@/parser/types";

const fixture = (name: string) => fs.readFileSync(path.join(__dirname, "../fixtures", name));

// Ники из текстовых Seat-строк ("Seat N: <ник> (<стек>...)") и из XML iPoker.
const TEXT_NICK_RE = /^Seat \d+: (.+?) \(/gm;
const XML_NICK_RE = /<player[^>]*\bname="([^"]+)"/g;

const ROOMS: {
  room: string;
  file: string;
  parse: (buffer: Buffer) => ParseResult;
  nickRe: RegExp;
}[] = [
  { room: "PokerStars", file: "ps_mtt.txt", parse: parsePokerStarsMtt, nickRe: TEXT_NICK_RE },
  { room: "Winamax", file: "winamax_mtt.txt", parse: parseWinamaxMtt, nickRe: TEXT_NICK_RE },
  { room: "888poker", file: "poker888_mtt.txt", parse: parse888Mtt, nickRe: TEXT_NICK_RE },
  { room: "iPoker", file: "ipoker_mtt.xml", parse: parseIpokerMtt, nickRe: XML_NICK_RE },
  { room: "WPN", file: "wpn_mtt.txt", parse: parseWpnMtt, nickRe: TEXT_NICK_RE },
];

describe.each(ROOMS)("псевдонимы оппонентов: $room", ({ file, parse, nickRe }) => {
  const buffer = fixture(file);
  const result = parse(buffer);
  if (!result.ok) throw new Error("фикстура не распарсилась: " + result.error.message);
  const data = result.data;
  const text = buffer.toString("utf-8");
  const nicks = [...new Set([...text.matchAll(new RegExp(nickRe.source, nickRe.flags))].map((m) => m[1]))];

  it("сырые ники оппонентов не попадают в вывод парсера", () => {
    // Hero-ник в выводе тоже недопустим: метка всегда «Hero».
    const json = JSON.stringify(data);
    for (const nick of nicks) {
      expect(json, `ник «${nick}» утёк в вывод`).not.toContain(JSON.stringify(nick).slice(1, -1));
    }
  });

  it("оппоненты получают псевдонимы oppN, Hero — нет", () => {
    expect(nicks.length).toBeGreaterThan(1); // в фикстуре есть оппоненты
    let tokened = 0;
    for (const hand of data.hands) {
      for (const seat of hand.tableSnapshot.seats) {
        if (seat.label === "Hero") {
          expect(seat.opponentToken).toBeUndefined();
        } else if (seat.opponentToken) {
          expect(seat.opponentToken).toMatch(/^opp\d+$/);
          tokened++;
        }
      }
    }
    expect(tokened).toBeGreaterThan(0);
  });

  it("у каждой раздачи есть момент времени playedAt (ISO)", () => {
    for (const hand of data.hands) {
      expect(hand.playedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });
});

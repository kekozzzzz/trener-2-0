import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parse888Mtt } from "@/parser/poker888";
import { parseHandHistory, sniffTournamentKey } from "@/parser";

const buffer = fs.readFileSync(path.join(__dirname, "../fixtures/poker888_mtt.txt"));
const REAL_NAMES = ["kefirhero", "Villain A", "Big Stack"];

describe("parse888Mtt — формат 888poker", () => {
  it("парсит мету (номер турнира, бай-ин как имя, дата DD MM YYYY)", () => {
    const r = parse888Mtt(buffer);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.room).toBe("888poker");
    expect(r.data.externalTournamentId).toBe("555");
    expect(r.data.name).toBe("$5 + $0.5");
    expect(r.data.playedAt).toBe("2024-01-01T12:00:00.000Z");
    expect(r.data.handsCount).toBe(3);
  });

  it("VPIP/PFR (суммы в скобках, ники с пробелами)", () => {
    const r = parse888Mtt(buffer);
    if (!r.ok) return;
    expect(r.data.vpipPercent).toBe(66.67);
    expect(r.data.pfrPercent).toBe(33.33);
  });

  it("chipResult с ВЫЧИСЛЕННОЙ непокрытой ставкой (888 её не печатает)", () => {
    const r = parse888Mtt(buffer);
    if (!r.ok) return;
    expect(r.data.hands[0].chipResult).toBe(-15); // анте 5 + SB 10, фолд
    expect(r.data.hands[1].chipResult).toBe(130); // рейз 60 + бет 50, забрал 245, анте 5
    expect(r.data.hands[2].chipResult).toBe(-1005); // анте 5 + BB 30 + колл 970
  });

  // hand[2] — премиум-рука в префлоп-олл-ине: форс, постфлоп-решений нет → COOLER (Артём 18.07).
  it("форс-олл-ин премиум-рукой на префлопе → COOLER", () => {
    const r = parse888Mtt(buffer);
    if (!r.ok) return;
    expect(r.data.hands[2].importanceLevel).toBe("COOLER");
  });

  it("позиция героя на баттоне; борд из ** Dealing **; карты через запятую", () => {
    const r = parse888Mtt(buffer);
    if (!r.ok) return;
    const heroSeat = r.data.hands[1].tableSnapshot.seats.find((s) => s.label === "Hero");
    expect(heroSeat?.position).toBe("BTN");
    expect(r.data.hands[1].tableSnapshot.board).toEqual(["As", "7c", "2d", "9h", "3s"]);
    expect(r.data.hands[1].tableSnapshot.heroCards).toEqual(["Ah", "Ad"]);
  });

  it("обезличивает: реальные ники не в снимке", () => {
    const r = parse888Mtt(buffer);
    if (!r.ok) return;
    const json = JSON.stringify(r.data.hands);
    for (const name of REAL_NAMES) expect(json).not.toContain(name);
  });

  it("роутер направляет 888 в 888-парсер; sniff даёт номер турнира", () => {
    const r = parseHandHistory(buffer);
    expect(r.ok && r.data.room).toBe("888poker");
    expect(sniffTournamentKey(buffer)).toEqual({ room: "888poker", tournamentId: "555" });
  });
});

// Аудит румов 19.07: markAllIns складывал АБСОЛЮТНЫЕ суммы рейзов одного игрока на улице
// («raises [300]» + «raises [900]» = 1200 вместо 900), вклад раздувался и достигал стека —
// игрок ЛОЖНО помечался ALL_IN. Считаем приростами; анте при этом в ставку на улице не входит.
describe("parse888Mtt — вклад считается приростами, а не суммой абсолютов", () => {
  const hand = (body: string) => Buffer.from(
    `***** 888poker Hand History for Game 2001 *****\n` +
      `15/30 Blinds No Limit Holdem - *** 01 01 2024 12:00:00\n` +
      `Tournament #555 $5 + $0.5 - Table #1 6 Max (Real Money)\n` +
      `Seat 3 is the button\nTotal number of players : 3\n` +
      `Seat 1: Villain A ( 5000 )\nSeat 2: kefirhero ( 5000 )\nSeat 3: Big Stack ( 5000 )\n` +
      `Villain A posts small blind [15]\nkefirhero posts big blind [30]\n` +
      `** Dealing down cards **\nDealt to kefirhero [ Kh, Ks ]\n${body}` +
      `** Summary **\nBig Stack collected [ 100 ]\n`,
    "utf8",
  );

  it("два рейза одного игрока на улице не превращаются в ложный олл-ин", () => {
    // Big Stack при стеке 5000 рейзит до 900, потом до 2000 — суммарно 2000, а не 2900.
    const r = parse888Mtt(hand(
      `Big Stack raises [900]\nVillain A raises [1500]\nBig Stack raises [2000]\nkefirhero folds\nVillain A calls [500]\n`,
    ));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const acts = r.data.hands[0].tableSnapshot.actions.filter((a) => a.action === "ALL_IN");
    expect(acts).toHaveLength(0); // никто не ва-банк: у всех стеки 5000
  });
});

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

  it("спорный проигрыш против олл-ина (по вкладу==стек) помечается CRITICAL", () => {
    const r = parse888Mtt(buffer);
    if (!r.ok) return;
    expect(r.data.hands[2].importanceLevel).toBe("CRITICAL");
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

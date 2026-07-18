import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseWinamaxMtt } from "@/parser/winamax";
import { parseHandHistory, sniffTournamentKey } from "@/parser";

const buffer = fs.readFileSync(path.join(__dirname, "../fixtures/winamax_mtt.txt"));
const REAL_NAMES = ["kefirhero", "Villain A", "Big Stack"];

describe("parseWinamaxMtt — формат Winamax", () => {
  it("парсит мету (номер турнира из имени стола, имя, дата UTC)", () => {
    const r = parseWinamaxMtt(buffer);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.room).toBe("Winamax");
    expect(r.data.externalTournamentId).toBe("555");
    expect(r.data.name).toBe("Test MTT");
    expect(r.data.playedAt).toBe("2024-01-01T12:00:00.000Z");
    expect(r.data.handsCount).toBe(3);
  });

  it("VPIP/PFR (ники с пробелами, действия без двоеточия)", () => {
    const r = parseWinamaxMtt(buffer);
    if (!r.ok) return;
    expect(r.data.vpipPercent).toBe(66.67);
    expect(r.data.pfrPercent).toBe(33.33);
  });

  it("chipResult (анте, склеенный борд, олл-ин оппонента)", () => {
    const r = parseWinamaxMtt(buffer);
    if (!r.ok) return;
    expect(r.data.hands[0].chipResult).toBe(-15); // анте 5 + SB 10
    expect(r.data.hands[1].chipResult).toBe(130); // рейз 60 + бет 50, забрал 245, анте 5
    expect(r.data.hands[2].chipResult).toBe(-1005); // анте 5 + BB 30 + колл 970
  });

  // hand[2] — премиум-рука коллом опен-олл-ина на префлопе: форс, постфлоп-решений нет → COOLER
  // (Артём 18.07). Проверку CRITICAL для спорных потерь несёт forced-preflop-allin.test.ts.
  it("форс-олл-ин премиум-рукой на префлопе → COOLER", () => {
    const r = parseWinamaxMtt(buffer);
    if (!r.ok) return;
    expect(r.data.hands[2].importanceLevel).toBe("COOLER");
  });

  it("позиция героя на баттоне; борд из SUMMARY", () => {
    const r = parseWinamaxMtt(buffer);
    if (!r.ok) return;
    const heroSeat = r.data.hands[1].tableSnapshot.seats.find((s) => s.label === "Hero");
    expect(heroSeat?.position).toBe("BTN");
    expect(r.data.hands[1].tableSnapshot.board).toEqual(["As", "7c", "2d", "9h", "3s"]);
  });

  it("обезличивает: реальные ники не в снимке, карты героя сохранены", () => {
    const r = parseWinamaxMtt(buffer);
    if (!r.ok) return;
    const json = JSON.stringify(r.data.hands);
    for (const name of REAL_NAMES) expect(json).not.toContain(name);
    expect(r.data.hands[1].tableSnapshot.heroCards).toEqual(["Ah", "Ad"]);
  });

  it("роутер направляет Winamax в Winamax-парсер; sniff даёт номер турнира", () => {
    const r = parseHandHistory(buffer);
    expect(r.ok && r.data.room).toBe("Winamax");
    expect(sniffTournamentKey(buffer)).toEqual({ room: "Winamax", tournamentId: "555" });
  });
});

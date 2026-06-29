import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseWpnMtt } from "@/parser/wpn";
import { parseHandHistory } from "@/parser";

const wpnBuffer = fs.readFileSync(path.join(__dirname, "../fixtures/wpn_mtt.txt"));

// Реальные ники из фикстуры — НЕ должны попасть в снимок (обезличивание, как у GG).
const REAL_NAMES = ["hero99", "Villain A", "Big Stack"];

describe("parseWpnMtt — формат ACR / PokerKing (WPN)", () => {
  it("парсит метаданные турнира (номер, имя-заглушка, дата UTC, площадка)", () => {
    const result = parseWpnMtt(wpnBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room).toBe("WPN");
    expect(result.data.externalTournamentId).toBe("999");
    expect(result.data.name).toBe("Holdem (No Limit) #999");
    expect(result.data.playedAt).toBe("2026-01-01T12:00:00.000Z");
    expect(result.data.handsCount).toBe(3);
  });

  it("определяет героя по «Dealt to» и считает VPIP/PFR", () => {
    const result = parseWpnMtt(wpnBuffer);
    if (!result.ok) return;
    // фолд / рейз+выигрыш / колл олл-ина → VPIP 2/3, PFR 1/3
    expect(result.data.vpipPercent).toBe(66.67);
    expect(result.data.pfrPercent).toBe(33.33);
  });

  it("считает chipResult героя (имена с пробелами, суммы с .00, олл-ин)", () => {
    const result = parseWpnMtt(wpnBuffer);
    if (!result.ok) return;
    expect(result.data.hands[0].chipResult).toBe(-15); // анте 5 + SB 10, фолд
    expect(result.data.hands[1].chipResult).toBe(130); // рейз 60 + бет 50, забрал 245, анте 5
    expect(result.data.hands[2].chipResult).toBe(-1005); // анте 5 + олл-ин колл 1000, проигрыш
  });

  it("спорный проигрыш олл-ина помечается CRITICAL", () => {
    const result = parseWpnMtt(wpnBuffer);
    if (!result.ok) return;
    expect(result.data.hands[2].importanceLevel).toBe("CRITICAL");
  });

  it("определяет позицию героя на баттоне", () => {
    const result = parseWpnMtt(wpnBuffer);
    if (!result.ok) return;
    const heroSeat = result.data.hands[1].tableSnapshot.seats.find((s) => s.label === "Hero");
    expect(heroSeat?.position).toBe("BTN");
  });

  it("обезличивает: реальные ники не попадают в снимок", () => {
    const result = parseWpnMtt(wpnBuffer);
    if (!result.ok) return;
    const json = JSON.stringify(result.data.hands);
    for (const name of REAL_NAMES) expect(json).not.toContain(name);
    // карты героя при этом сохранены
    expect(result.data.hands[1].tableSnapshot.heroCards).toEqual(["Ah", "Ad"]);
  });

  it("роутер форматов направляет WPN-файл в WPN-парсер", () => {
    const result = parseHandHistory(wpnBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room).toBe("WPN");
  });

  it("роутер отклоняет нераспознанный формат", () => {
    const result = parseHandHistory(Buffer.from("Winamax Poker - Tournament \"X\" ..."));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("UNSUPPORTED_FORMAT");
  });
});

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parsePokerStarsMtt } from "@/parser/ps";
import { parseHandHistory, sniffTournamentKey } from "@/parser";

const psBuffer = fs.readFileSync(path.join(__dirname, "../fixtures/ps_mtt.txt"));

// Реальные ники из фикстуры — НЕ должны попасть в снимок (обезличивание).
const REAL_NAMES = ["kefirhero", "Villain A", "Big Stack"];

describe("parsePokerStarsMtt — формат PokerStars / Chico", () => {
  it("парсит метаданные турнира и метит Chico по префиксу стола CHC_", () => {
    const result = parsePokerStarsMtt(psBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room).toBe("Chico");
    expect(result.data.externalTournamentId).toBe("555");
    expect(result.data.name).toBe("$5+$0.50 USD Hold'em No Limit");
    expect(result.data.playedAt).toBe("2026-01-01T12:00:00.000Z");
    expect(result.data.handsCount).toBe(3);
  });

  it("определяет героя по «Dealt to» и считает VPIP/PFR (ники с пробелами)", () => {
    const result = parsePokerStarsMtt(psBuffer);
    if (!result.ok) return;
    // фолд / рейз+выигрыш / колл олл-ина → VPIP 2/3, PFR 1/3
    expect(result.data.vpipPercent).toBe(66.67);
    expect(result.data.pfrPercent).toBe(33.33);
  });

  it("считает chipResult героя (двоеточие, анте, олл-ин оппонента)", () => {
    const result = parsePokerStarsMtt(psBuffer);
    if (!result.ok) return;
    expect(result.data.hands[0].chipResult).toBe(-15); // анте 5 + SB 10, фолд
    expect(result.data.hands[1].chipResult).toBe(130); // рейз 60 + бет 50, забрал 245, анте 5
    expect(result.data.hands[2].chipResult).toBe(-1005); // анте 5 + BB 30 + колл 970, проигрыш
  });

  it("спорный проигрыш помечается CRITICAL", () => {
    const result = parsePokerStarsMtt(psBuffer);
    if (!result.ok) return;
    expect(result.data.hands[2].importanceLevel).toBe("CRITICAL");
  });

  it("определяет позицию героя на баттоне", () => {
    const result = parsePokerStarsMtt(psBuffer);
    if (!result.ok) return;
    const heroSeat = result.data.hands[1].tableSnapshot.seats.find((s) => s.label === "Hero");
    expect(heroSeat?.position).toBe("BTN");
  });

  it("обезличивает: реальные ники не попадают в снимок, карты героя сохранены", () => {
    const result = parsePokerStarsMtt(psBuffer);
    if (!result.ok) return;
    const json = JSON.stringify(result.data.hands);
    for (const name of REAL_NAMES) expect(json).not.toContain(name);
    expect(result.data.hands[1].tableSnapshot.heroCards).toEqual(["Ah", "Ad"]);
  });

  it("роутер направляет PS-файл в PS-парсер", () => {
    const result = parseHandHistory(psBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room).toBe("Chico");
  });

  it("sniffTournamentKey распознаёт PS для склейки многостольных файлов", () => {
    expect(sniffTournamentKey(psBuffer)).toEqual({ room: "PS", tournamentId: "555" });
  });
});

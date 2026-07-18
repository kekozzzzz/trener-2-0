import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseIpokerMtt } from "@/parser/ipoker";
import { convertCard } from "@/parser/ipoker/hand";
import { parseHandHistory, sniffTournamentKey } from "@/parser";

const ipokerBuffer = fs.readFileSync(path.join(__dirname, "../fixtures/ipoker_mtt.xml"));

// Реальные ники из фикстуры — НЕ должны попасть в снимок (обезличивание).
const REAL_NAMES = ["kefirhero", "VillainA", "BigStack"];

describe("parseIpokerMtt — формат iPoker (XML)", () => {
  it("конвертирует карты <масть><ранг> в наш вид (ten = 10 → T)", () => {
    expect(convertCard("S4")).toBe("4s");
    expect(convertCard("DQ")).toBe("Qd");
    expect(convertCard("HA")).toBe("Ah");
    expect(convertCard("C10")).toBe("Tc");
  });

  it("парсит метаданные турнира из <general> (герой по <nickname>)", () => {
    const result = parseIpokerMtt(ipokerBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room).toBe("iPoker");
    expect(result.data.externalTournamentId).toBe("777");
    expect(result.data.name).toBe("Test MTT #777");
    expect(result.data.playedAt).toBe("2026-01-01T12:00:00.000Z");
    expect(result.data.handsCount).toBe(3);
  });

  it("считает VPIP/PFR по сырым type-кодам действий", () => {
    const result = parseIpokerMtt(ipokerBuffer);
    if (!result.ok) return;
    expect(result.data.vpipPercent).toBe(66.67);
    expect(result.data.pfrPercent).toBe(33.33);
  });

  it("берёт chipResult из тегов <player win bet> (win − bet)", () => {
    const result = parseIpokerMtt(ipokerBuffer);
    if (!result.ok) return;
    expect(result.data.hands[0].chipResult).toBe(-15); // bet 15, win 0
    expect(result.data.hands[1].chipResult).toBe(130); // win 245 − bet 115
    expect(result.data.hands[2].chipResult).toBe(-1005); // bet 1005, проигрыш
  });

  // hand[2] — премиум-рука в префлоп-олл-ине: форс, постфлоп-решений нет → COOLER (Артём 18.07).
  it("форс-олл-ин премиум-рукой на префлопе → COOLER", () => {
    const result = parseIpokerMtt(ipokerBuffer);
    if (!result.ok) return;
    expect(result.data.hands[2].importanceLevel).toBe("COOLER");
  });

  it("определяет позицию героя на баттоне (dealer=1) и его карты/борд", () => {
    const result = parseIpokerMtt(ipokerBuffer);
    if (!result.ok) return;
    const heroSeat = result.data.hands[1].tableSnapshot.seats.find((s) => s.label === "Hero");
    expect(heroSeat?.position).toBe("BTN");
    expect(result.data.hands[1].tableSnapshot.board).toEqual(["As", "7c", "2d", "9h", "3s"]);
    expect(result.data.hands[2].tableSnapshot.heroCards).toEqual(["Kh", "Ks"]);
  });

  it("обезличивает: реальные ники не попадают в снимок", () => {
    const result = parseIpokerMtt(ipokerBuffer);
    if (!result.ok) return;
    const json = JSON.stringify(result.data.hands);
    for (const name of REAL_NAMES) expect(json).not.toContain(name);
  });

  it("роутер направляет iPoker-XML в iPoker-парсер", () => {
    const result = parseHandHistory(ipokerBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room).toBe("iPoker");
  });

  it("sniffTournamentKey распознаёт iPoker для склейки многостольных файлов", () => {
    expect(sniffTournamentKey(ipokerBuffer)).toEqual({ room: "iPoker", tournamentId: "777" });
  });
});

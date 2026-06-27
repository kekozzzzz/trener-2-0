import { describe, it, expect } from "vitest";
import { heroMadeHand } from "@/parser/made-hand";

describe("heroMadeHand", () => {
  it("префлоп (борда нет) — null", () => {
    expect(heroMadeHand(["Ac", "8h"], [])).toBeNull();
  });

  it("Hero не попал — пары нет", () => {
    // Q8 на A-9-2 (как наша «простая» рука): голый борд без пары, Hero ничего не добавил
    const r = heroMadeHand(["Qd", "8d"], ["9d", "2h", "As"]);
    expect(r?.category).toBe("HIGH");
    expect(r?.improves).toBe(false);
  });

  it("пара лежит на борде — своей пары нет (важно против галлюцинации)", () => {
    // A8 на K-J-4-4-5: пара четвёрок уже на борде, Hero её не делал
    const r = heroMadeHand(["Ac", "8h"], ["Kh", "Jh", "4c", "4d", "5s"]);
    expect(r?.category).toBe("PAIR");
    expect(r?.improves).toBe(false);
    expect(r?.ru).toContain("на борде");
  });

  it("топ-пара, когда Hero спарил старшую карту борда", () => {
    const r = heroMadeHand(["Ac", "8h"], ["As", "9d", "2h"]);
    expect(r?.category).toBe("PAIR");
    expect(r?.improves).toBe(true);
    expect(r?.ru).toContain("топ-пара");
  });

  it("вторая пара", () => {
    const r = heroMadeHand(["9c", "8h"], ["Ad", "9s", "2h"]);
    expect(r?.ru).toContain("вторая пара");
  });

  it("карманная пара / оверпара", () => {
    expect(heroMadeHand(["9c", "9d"], ["2h", "5s", "Kc"])?.ru).toContain("карманная пара");
    expect(heroMadeHand(["Qc", "Qd"], ["2h", "5s", "7c"])?.ru).toContain("оверпара");
  });

  it("фулл-хаус (как наша «средняя» рука A6 на спаренном борде)", () => {
    const r = heroMadeHand(["Ac", "6c"], ["6h", "8d", "6s", "3c", "As"]);
    expect(r?.category).toBe("FULL_HOUSE");
    expect(r?.ru).toContain("фулл-хаус");
  });

  it("сет против трипса", () => {
    expect(heroMadeHand(["7c", "7d"], ["7h", "2s", "Kc"])?.ru).toContain("сет");
    expect(heroMadeHand(["7c", "Ad"], ["7h", "7s", "Kc"])?.ru).toContain("трипс");
  });

  it("флеш и стрит", () => {
    expect(heroMadeHand(["Ac", "2c"], ["7c", "9c", "Kc"])?.category).toBe("FLUSH");
    expect(heroMadeHand(["8c", "9d"], ["Th", "Js", "Qc"])?.category).toBe("STRAIGHT");
  });
});

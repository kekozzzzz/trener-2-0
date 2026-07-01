import { describe, it, expect } from "vitest";
import type { TableAction, TableSnapshot } from "@/parser/types";
import { detectHeroVsOpen } from "@/parser/vs-open";
import { isVsOpenThreeBetSignificantlyWide } from "@/config/poker/vs-open-chart";

describe("isVsOpenThreeBetSignificantlyWide — 3-бет против опена шире нормы", () => {
  it("велью/блеф в ренже, мусор — флаг", () => {
    expect(isVsOpenThreeBetSignificantlyWide("UTG", "AA")).toBe(false); // велью
    expect(isVsOpenThreeBetSignificantlyWide("UTG", "A5s")).toBe(false); // блеф
    expect(isVsOpenThreeBetSignificantlyWide("UTG", "72o")).toBe(true); // спью
    expect(isVsOpenThreeBetSignificantlyWide("UTG", "98s")).toBe(true); // не в ренже рано
  });

  it("шире по позиции: JTo норм с BTN, но не с UTG", () => {
    expect(isVsOpenThreeBetSignificantlyWide("BTN", "JTo")).toBe(false); // BTN блеф
    expect(isVsOpenThreeBetSignificantlyWide("UTG", "JTo")).toBe(true);
  });

  it("BB не судим этим чартом (у него свой)", () => {
    expect(isVsOpenThreeBetSignificantlyWide("BB", "72o")).toBe(false);
  });
});

// Стол 40bb: опенер UTG, Hero заданной позиции отвечает.
function vsSnap(opts: {
  heroCards: string[];
  heroCoarse?: TableSnapshot["seats"][number]["position"];
  heroName?: string;
  hero: TableAction;
  ahead?: TableAction[];
}): TableSnapshot {
  const ahead: TableAction[] = opts.ahead ?? [{ street: "PREFLOP", actor: "Opener", action: "RAISE", amount: 250 }];
  return {
    seats: [
      { label: "Opener", position: "EARLY", positionName: "UTG", startingStack: 4000 },
      { label: "Hero", position: opts.heroCoarse ?? "CO", positionName: opts.heroName ?? "CO", startingStack: 4000 },
      { label: "SBP", position: "SB", startingStack: 4000 },
      { label: "BBP", position: "BB", startingStack: 4000 },
    ],
    heroCards: opts.heroCards,
    board: [],
    actions: [
      { street: "PREFLOP", actor: "SBP", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "BBP", action: "POST_BB", amount: 100 },
      ...ahead,
      opts.hero,
    ],
    potTotal: 0,
  };
}

describe("detectHeroVsOpen — против одиночного опена (не BB)", () => {
  it("Hero CO 3-бетит опен UTG → CO/3BET", () => {
    const s = vsSnap({ heroCards: ["7c", "2d"], hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 750 } });
    expect(detectHeroVsOpen(s)).toEqual({ heroPosition: "CO", code: "72o", action: "3BET" });
  });

  it("колл распознаётся", () => {
    const s = vsSnap({ heroCards: ["Ad", "Kd"], hero: { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 250 } });
    expect(detectHeroVsOpen(s)).toEqual({ heroPosition: "CO", code: "AKs", action: "CALL" });
  });

  it("Hero в BB → null (обрабатывает чарт защиты BB)", () => {
    const s = vsSnap({ heroCards: ["Ad", "Ac"], heroCoarse: "BB", heroName: "BB", hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 750 } });
    expect(detectHeroVsOpen(s)).toBeNull();
  });

  it("лимпер впереди → не наш спот", () => {
    const s = vsSnap({
      heroCards: ["Ad", "Ac"],
      ahead: [{ street: "PREFLOP", actor: "Opener", action: "CALL", amount: 100 }],
      hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 400 },
    });
    expect(detectHeroVsOpen(s)).toBeNull();
  });

  it("Hero открывается первым (рейза впереди нет) → не наш спот", () => {
    const s = vsSnap({
      heroCards: ["Ad", "Ac"],
      ahead: [{ street: "PREFLOP", actor: "Opener", action: "FOLD" }],
      hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 },
    });
    expect(detectHeroVsOpen(s)).toBeNull();
  });
});

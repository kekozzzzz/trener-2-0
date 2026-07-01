import { describe, it, expect } from "vitest";
import type { TableAction, TableSnapshot } from "@/parser/types";
import { detectHeroBBDefense } from "@/parser/bb-defense";
import { isBBThreeBetSignificantlyWide } from "@/config/poker/bb-defense-chart";

describe("isBBThreeBetSignificantlyWide — 3-бет из BB шире нормы", () => {
  it("велью и блеф в ренже (не флаг), явный мусор — флаг", () => {
    expect(isBBThreeBetSignificantlyWide("UTG", "AA")).toBe(false); // велью QQ+
    expect(isBBThreeBetSignificantlyWide("UTG", "A5s")).toBe(false); // блеф в ренже
    expect(isBBThreeBetSignificantlyWide("UTG", "72o")).toBe(true); // спью
    expect(isBBThreeBetSignificantlyWide("UTG", "A5o")).toBe(true); // не в 3-бет-ренже
    expect(isBBThreeBetSignificantlyWide("UTG", "98s")).toBe(true); // vs UTG 98s не 3-бетим
  });

  it("граница шире по позиции: 98s норм vs BTN, но не vs UTG", () => {
    expect(isBBThreeBetSignificantlyWide("BTN", "98s")).toBe(false); // BTN блеф
    expect(isBBThreeBetSignificantlyWide("UTG", "98s")).toBe(true);
  });

  it("полоса допуска: KTs от блефа KJs — не флаг, K9s — флаг", () => {
    expect(isBBThreeBetSignificantlyWide("UTG", "KTs")).toBe(false); // допуск от KJs
    expect(isBBThreeBetSignificantlyWide("UTG", "K9s")).toBe(true);
  });

  it("несудимые позиции (SB-опен/мусорная метка) не флагаем", () => {
    expect(isBBThreeBetSignificantlyWide("SB", "72o")).toBe(false);
    expect(isBBThreeBetSignificantlyWide("OTHER", "72o")).toBe(false);
  });
});

// Стол 40bb (BB=100): опенер на UTG (EARLY/positionName), Hero на BB отвечает.
function bbSnap(opts: {
  heroCards: string[];
  openerName?: string; // positionName открывашки (UTG по умолчанию)
  openerCoarse?: TableSnapshot["seats"][number]["position"];
  hero: TableAction; // действие Hero (RAISE=3бет / CALL / FOLD)
  ahead?: TableAction[]; // действия до Hero вместо стандартного «опен + фолд SB»
}): TableSnapshot {
  const opener = "Villain";
  const ahead: TableAction[] = opts.ahead ?? [
    { street: "PREFLOP", actor: opener, action: "RAISE", amount: 250 },
    { street: "PREFLOP", actor: "SBP", action: "FOLD" },
  ];
  return {
    seats: [
      { label: "SBP", position: "SB", startingStack: 4000 },
      { label: "Hero", position: "BB", positionName: "BB", startingStack: 4000 },
      {
        label: opener,
        position: opts.openerCoarse ?? "EARLY",
        positionName: opts.openerName ?? "UTG",
        startingStack: 4000,
      },
    ],
    heroCards: opts.heroCards,
    board: [],
    actions: [
      { street: "PREFLOP", actor: "SBP", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 100 },
      ...ahead,
      opts.hero,
    ],
    potTotal: 0,
  };
}

describe("detectHeroBBDefense — спот защиты BB", () => {
  it("Hero на BB 3-бетит одиночный опен UTG → 3BET + позиция открывашки", () => {
    const s = bbSnap({ heroCards: ["7c", "2d"], hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 800 } });
    expect(detectHeroBBDefense(s)).toEqual({ openerPosition: "UTG", code: "72o", action: "3BET" });
  });

  it("колл и фолд из BB тоже распознаются", () => {
    const call = bbSnap({ heroCards: ["Ad", "Kd"], hero: { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 150 } });
    expect(detectHeroBBDefense(call)).toEqual({ openerPosition: "UTG", code: "AKs", action: "CALL" });
    const fold = bbSnap({ heroCards: ["9c", "4d"], hero: { street: "PREFLOP", actor: "Hero", action: "FOLD" } });
    expect(detectHeroBBDefense(fold)).toEqual({ openerPosition: "UTG", code: "94o", action: "FOLD" });
  });

  it("позиция открывашки разводится: UTG+1 → MP", () => {
    const s = bbSnap({ heroCards: ["Ad", "Ac"], openerName: "UTG+1", hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 800 } });
    expect(detectHeroBBDefense(s)?.openerPosition).toBe("MP");
  });

  it("лимпер впереди (мультивей) → не наш спот", () => {
    const s = bbSnap({
      heroCards: ["Ad", "Ac"],
      ahead: [
        { street: "PREFLOP", actor: "Villain", action: "RAISE", amount: 250 },
        { street: "PREFLOP", actor: "SBP", action: "CALL", amount: 200 },
      ],
      hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 800 },
    });
    expect(detectHeroBBDefense(s)).toBeNull();
  });

  it("опен-олл-ин (пуш-фолд) → не наш спот", () => {
    const s = bbSnap({
      heroCards: ["Ad", "Ac"],
      ahead: [
        { street: "PREFLOP", actor: "Villain", action: "ALL_IN", amount: 4000 },
        { street: "PREFLOP", actor: "SBP", action: "FOLD" },
      ],
      hero: { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 3900 },
    });
    expect(detectHeroBBDefense(s)).toBeNull();
  });

  it("опен с SB (блайнд-vs-блайнд) не покрыт → null", () => {
    const s = bbSnap({
      heroCards: ["Ad", "Ac"],
      openerCoarse: "SB",
      openerName: "SB",
      ahead: [{ street: "PREFLOP", actor: "Villain", action: "RAISE", amount: 250 }],
      hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 800 },
    });
    expect(detectHeroBBDefense(s)).toBeNull();
  });

  it("Hero не на BB → null", () => {
    const s = bbSnap({ heroCards: ["Ad", "Ac"], hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 800 } });
    s.seats.find((x) => x.label === "Hero")!.position = "CO";
    expect(detectHeroBBDefense(s)).toBeNull();
  });
});

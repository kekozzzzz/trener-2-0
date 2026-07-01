import { describe, it, expect } from "vitest";
import type { TableAction, TableSnapshot } from "@/parser/types";
import { detectHeroDefVs3bet } from "@/parser/def-vs-3bet";
import { isFourBetSignificantlyWide } from "@/config/poker/def-vs-3bet-chart";

describe("isFourBetSignificantlyWide — 4-бет против 3-бета шире нормы", () => {
  it("велью/блеф-блокеры в норме, мусорный 4-бет — флаг", () => {
    expect(isFourBetSignificantlyWide("UTG", "AA")).toBe(false); // велью
    expect(isFourBetSignificantlyWide("UTG", "A5s")).toBe(false); // блеф-блокер
    expect(isFourBetSignificantlyWide("UTG", "98s")).toBe(true); // спью
    expect(isFourBetSignificantlyWide("UTG", "55")).toBe(true); // 4-бет мелкой пары
  });

  it("шире по позиции: KJo норм 4-бетом с CO, но не с UTG", () => {
    expect(isFourBetSignificantlyWide("CO", "KJo")).toBe(false);
    expect(isFourBetSignificantlyWide("UTG", "KJo")).toBe(true);
  });

  it("несудимую позицию (BB) не флагаем", () => {
    expect(isFourBetSignificantlyWide("BB", "72o")).toBe(false);
  });
});

// Стол 40bb: Hero (CO по умолч.) открывается, в него 3-бет, свернулось к Hero, он отвечает.
function def3Snap(opts: {
  heroCards: string[];
  heroCoarse?: TableSnapshot["seats"][number]["position"];
  heroName?: string;
  response: TableAction; // второе действие Hero: RAISE=4бет / CALL / FOLD
  middle?: TableAction[]; // что между открытием Hero и его ответом (по умолч. 3-бет + фолды)
  openFirst?: boolean; // Hero открывается первым (по умолч. true)
  prefix?: TableAction[]; // действия ДО открытия Hero (напр. чужой опен → Hero не открывашка)
}): TableSnapshot {
  const middle: TableAction[] = opts.middle ?? [
    { street: "PREFLOP", actor: "ThreeBettor", action: "RAISE", amount: 750 },
    { street: "PREFLOP", actor: "SBP", action: "FOLD" },
    { street: "PREFLOP", actor: "BBP", action: "FOLD" },
  ];
  const heroOpen: TableAction[] = opts.openFirst === false ? [] : [{ street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 }];
  return {
    seats: [
      { label: "Hero", position: opts.heroCoarse ?? "CO", positionName: opts.heroName ?? "CO", startingStack: 4000 },
      { label: "ThreeBettor", position: "BTN", positionName: "BTN", startingStack: 4000 },
      { label: "SBP", position: "SB", startingStack: 4000 },
      { label: "BBP", position: "BB", startingStack: 4000 },
    ],
    heroCards: opts.heroCards,
    board: [],
    actions: [
      { street: "PREFLOP", actor: "SBP", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "BBP", action: "POST_BB", amount: 100 },
      ...(opts.prefix ?? []),
      ...heroOpen,
      ...middle,
      opts.response,
    ],
    potTotal: 0,
  };
}

describe("detectHeroDefVs3bet — защита vs 3-бет", () => {
  it("Hero CO открыл, в него 3-бет, Hero 4-бетит → CO/4BET", () => {
    const s = def3Snap({ heroCards: ["9c", "8c"], response: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 2000 } });
    expect(detectHeroDefVs3bet(s)).toEqual({ heroPosition: "CO", code: "98s", action: "4BET" });
  });

  it("колл и фолд на 3-бет распознаются", () => {
    const call = def3Snap({ heroCards: ["Kd", "Qd"], response: { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 500 } });
    expect(detectHeroDefVs3bet(call)).toEqual({ heroPosition: "CO", code: "KQs", action: "CALL" });
    const fold = def3Snap({ heroCards: ["Jc", "9d"], response: { street: "PREFLOP", actor: "Hero", action: "FOLD" } });
    expect(detectHeroDefVs3bet(fold)).toEqual({ heroPosition: "CO", code: "J9o", action: "FOLD" });
  });

  it("Hero не открывашка (кто-то поднял раньше) → null", () => {
    const s = def3Snap({
      heroCards: ["Ad", "Ac"],
      prefix: [{ street: "PREFLOP", actor: "ThreeBettor", action: "RAISE", amount: 250 }],
      middle: [{ street: "PREFLOP", actor: "SBP", action: "FOLD" }, { street: "PREFLOP", actor: "BBP", action: "FOLD" }],
      response: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 750 },
    });
    expect(detectHeroDefVs3bet(s)).toBeNull();
  });

  it("коллер нашего опена до 3-бета → не чистая защита vs 3-бет", () => {
    const s = def3Snap({
      heroCards: ["Ad", "Ac"],
      middle: [
        { street: "PREFLOP", actor: "SBP", action: "CALL", amount: 250 },
        { street: "PREFLOP", actor: "ThreeBettor", action: "RAISE", amount: 900 },
        { street: "PREFLOP", actor: "BBP", action: "FOLD" },
      ],
      response: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 2500 },
    });
    expect(detectHeroDefVs3bet(s)).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import type { TableAction, TableSnapshot } from "@/parser/types";
import { detectHeroSqueeze } from "@/parser/squeeze";
import { isSqueezeSignificantlyWide } from "@/config/poker/squeeze-chart";

describe("isSqueezeSignificantlyWide — сквиз шире нормы (велью-тяжёлый)", () => {
  it("велью/блеф в норме, лёгкий сквиз — флаг", () => {
    expect(isSqueezeSignificantlyWide("CO", "AA")).toBe(false); // велью
    expect(isSqueezeSignificantlyWide("CO", "A5s")).toBe(false); // блеф-блокер
    expect(isSqueezeSignificantlyWide("CO", "T9s")).toBe(true); // лёгкий сквиз
    expect(isSqueezeSignificantlyWide("CO", "72o")).toBe(true);
  });

  it("несудимую позицию не флагаем", () => {
    expect(isSqueezeSignificantlyWide("BB", "72o")).toBe(false);
  });
});

// Стол 40bb: опен UTG + коллер HJ, Hero (BTN по умолч.) действует поверх.
function sqSnap(opts: {
  heroCards: string[];
  heroCoarse?: TableSnapshot["seats"][number]["position"];
  heroName?: string;
  hero: TableAction;
  ahead?: TableAction[];
}): TableSnapshot {
  const ahead: TableAction[] = opts.ahead ?? [
    { street: "PREFLOP", actor: "Opener", action: "RAISE", amount: 250 },
    { street: "PREFLOP", actor: "Caller", action: "CALL", amount: 250 },
  ];
  return {
    seats: [
      { label: "Opener", position: "EARLY", positionName: "UTG", startingStack: 4000 },
      { label: "Caller", position: "HJ", positionName: "HJ", startingStack: 4000 },
      { label: "Hero", position: opts.heroCoarse ?? "BTN", positionName: opts.heroName ?? "BTN", startingStack: 4000 },
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

describe("detectHeroSqueeze — сквиз поверх опена с коллером", () => {
  it("Hero BTN 3-бетит опен+коллер → BTN + код", () => {
    const s = sqSnap({ heroCards: ["Tc", "9c"], hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1000 } });
    expect(detectHeroSqueeze(s)).toEqual({ heroPosition: "BTN", code: "T9s" });
  });

  it("коллера нет (только опен) → это обычный 3-бет, не сквиз", () => {
    const s = sqSnap({
      heroCards: ["Ad", "Ac"],
      ahead: [{ street: "PREFLOP", actor: "Opener", action: "RAISE", amount: 250 }],
      hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 750 },
    });
    expect(detectHeroSqueeze(s)).toBeNull();
  });

  it("лимп до опена (грязный банк) → не сквиз", () => {
    const s = sqSnap({
      heroCards: ["Ad", "Ac"],
      ahead: [
        { street: "PREFLOP", actor: "Limper", action: "CALL", amount: 100 },
        { street: "PREFLOP", actor: "Opener", action: "RAISE", amount: 400 },
        { street: "PREFLOP", actor: "Caller", action: "CALL", amount: 400 },
      ],
      hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1400 },
    });
    expect(detectHeroSqueeze(s)).toBeNull();
  });

  it("Hero холодно докалливает (не рейзит) → не сквиз", () => {
    const s = sqSnap({ heroCards: ["Ad", "Ac"], hero: { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 250 } });
    expect(detectHeroSqueeze(s)).toBeNull();
  });
});

import { describe, it, expect } from "vitest";
import type { TableAction, TableSnapshot } from "@/parser/types";
import { detectHeroIso } from "@/parser/iso";
import { isIsoSignificantlyWide } from "@/config/poker/iso-chart";

describe("isIsoSignificantlyWide — изоляция шире нормы (RFI минус низ)", () => {
  it("сильные руки в норме, мусор — флаг", () => {
    expect(isIsoSignificantlyWide("CO", "AKs")).toBe(false); // в RFI
    expect(isIsoSignificantlyWide("CO", "72o")).toBe(true); // мусор
  });

  it("мелкие пары 22-66 — флаг (лучше оверлимп), 77+ в норме", () => {
    expect(isIsoSignificantlyWide("CO", "55")).toBe(true); // 22-66 убраны из iso
    expect(isIsoSignificantlyWide("CO", "66")).toBe(true);
    expect(isIsoSignificantlyWide("CO", "77")).toBe(false); // 77+ изолируем
  });

  it("несудимую позицию (BB) не флагаем", () => {
    expect(isIsoSignificantlyWide("BB", "72o")).toBe(false);
  });
});

// Стол 40bb: впереди один лимпер, Hero (CO по умолч.) действует.
function isoSnap(opts: {
  heroCards: string[];
  heroCoarse?: TableSnapshot["seats"][number]["position"];
  heroName?: string;
  hero: TableAction;
  ahead?: TableAction[];
}): TableSnapshot {
  const ahead: TableAction[] = opts.ahead ?? [{ street: "PREFLOP", actor: "Limper", action: "CALL", amount: 100 }];
  return {
    seats: [
      { label: "Limper", position: "EARLY", positionName: "UTG", startingStack: 4000 },
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

describe("detectHeroIso — изоляция лимпера", () => {
  it("Hero CO поднимает над лимпером → CO + код", () => {
    const s = isoSnap({ heroCards: ["5c", "5d"], hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 400 } });
    expect(detectHeroIso(s)).toEqual({ heroPosition: "CO", code: "55" });
  });

  it("нет лимпера (все сбросили) → не изоляция", () => {
    const s = isoSnap({
      heroCards: ["Ad", "Ac"],
      ahead: [{ street: "PREFLOP", actor: "Limper", action: "FOLD" }],
      hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 },
    });
    expect(detectHeroIso(s)).toBeNull();
  });

  it("рейз впереди → не изоляция (3-бет/сквиз)", () => {
    const s = isoSnap({
      heroCards: ["Ad", "Ac"],
      ahead: [{ street: "PREFLOP", actor: "Limper", action: "RAISE", amount: 250 }],
      hero: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 750 },
    });
    expect(detectHeroIso(s)).toBeNull();
  });

  it("Hero докалливает (оверлимп) → не изоляция", () => {
    const s = isoSnap({ heroCards: ["Ad", "Ac"], hero: { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 100 } });
    expect(detectHeroIso(s)).toBeNull();
  });
});

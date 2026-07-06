import { describe, it, expect } from "vitest";
import type { TableAction, TableSnapshot } from "@/parser/types";
import { detectHeroOpenShove } from "@/parser/open-shove";
import { isOpenShoveSignificantlyWide, stackBandFor } from "@/config/poker/push-fold-chart";

describe("stackBandFor / isOpenShoveSignificantlyWide", () => {
  it("стек-бэнд: <10 SHORT, 10-14 MID, ≥15 null", () => {
    expect(stackBandFor(7)).toBe("SHORT");
    expect(stackBandFor(12)).toBe("MID");
    expect(stackBandFor(15)).toBeNull();
  });

  it("UTG на 12bb: AA в норме, 72o и 44 шире нормы, 55 — граница допуска", () => {
    expect(isOpenShoveSignificantlyWide("MID", "UTG", "AA")).toBe(false); // 66+
    expect(isOpenShoveSignificantlyWide("MID", "UTG", "72o")).toBe(true);
    expect(isOpenShoveSignificantlyWide("MID", "UTG", "55")).toBe(false); // сосед 66 — допуск
    expect(isOpenShoveSignificantlyWide("MID", "UTG", "44")).toBe(true); // а 44 уже явно вне
  });

  it("шире по позиции/стеку: 44 норм на SHORT-CO, но не на MID-UTG", () => {
    expect(isOpenShoveSignificantlyWide("SHORT", "CO", "44")).toBe(false); // CO 0-9 = 22+
    expect(isOpenShoveSignificantlyWide("MID", "UTG", "44")).toBe(true);
  });

  it("даже широкий пуш не включает мусор 72o", () => {
    expect(isOpenShoveSignificantlyWide("SHORT", "SB", "72o")).toBe(true);
  });

  it("несудимую позицию не флагаем", () => {
    expect(isOpenShoveSignificantlyWide("MID", "BB", "72o")).toBe(false);
  });
});

// Стол BB=100. Hero заданной позиции/стека идёт олл-ин первым в банк (соперники фолдят).
function shoveSnap(opts: {
  heroCards: string[];
  coarse?: TableSnapshot["seats"][number]["position"];
  positionName?: string;
  stackBb: number;
  heroAction?: TableAction; // по умолчанию ALL_IN
  ahead?: TableAction[]; // действия до Hero (по умолчанию один фолд)
}): TableSnapshot {
  const hero: TableAction = opts.heroAction ?? { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: opts.stackBb * 100 };
  const ahead: TableAction[] = opts.ahead ?? [{ street: "PREFLOP", actor: "P1", action: "FOLD" }];
  return {
    seats: [
      { label: "P1", position: "CO", startingStack: 4000 },
      { label: "SBP", position: "SB", startingStack: 4000 },
      { label: "BBP", position: "BB", startingStack: 4000 },
      {
        label: "Hero",
        position: opts.coarse ?? "EARLY",
        positionName: opts.positionName ?? "UTG",
        startingStack: opts.stackBb * 100,
      },
    ],
    heroCards: opts.heroCards,
    board: [],
    actions: [
      { street: "PREFLOP", actor: "SBP", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "BBP", action: "POST_BB", amount: 100 },
      ...ahead,
      hero,
    ],
    potTotal: 0,
  };
}

describe("detectHeroOpenShove — опен-шов на коротком", () => {
  it("UTG 8bb олл-ин первым → UTG/SHORT", () => {
    const s = shoveSnap({ heroCards: ["7c", "2d"], stackBb: 8 });
    expect(detectHeroOpenShove(s)).toEqual({ position: "UTG", band: "SHORT", code: "72o" });
  });

  it("BTN 12bb олл-ин → BTN/MID", () => {
    const s = shoveSnap({ heroCards: ["Ad", "Ac"], coarse: "BTN", positionName: "BTN", stackBb: 12 });
    expect(detectHeroOpenShove(s)).toEqual({ position: "BTN", band: "MID", code: "AA" });
  });

  it("HJ сводится к CO", () => {
    const s = shoveSnap({ heroCards: ["Ad", "Ac"], coarse: "HJ", positionName: "HJ", stackBb: 9 });
    expect(detectHeroOpenShove(s)?.position).toBe("CO");
  });

  it("стек ≥15bb → не пуш-фолд (null)", () => {
    const s = shoveSnap({ heroCards: ["Ad", "Ac"], stackBb: 20 });
    expect(detectHeroOpenShove(s)).toBeNull();
  });

  it("не олл-ин, а рейз → не опен-шов", () => {
    const s = shoveSnap({ heroCards: ["Ad", "Ac"], stackBb: 8, heroAction: { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 300 } });
    expect(detectHeroOpenShove(s)).toBeNull();
  });

  it("кто-то вошёл до Hero → не «первым в банк»", () => {
    const s = shoveSnap({
      heroCards: ["Ad", "Ac"],
      stackBb: 8,
      ahead: [{ street: "PREFLOP", actor: "P1", action: "RAISE", amount: 250 }],
    });
    expect(detectHeroOpenShove(s)).toBeNull();
  });
});

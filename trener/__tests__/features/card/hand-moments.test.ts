import { describe, it, expect } from "vitest";
import { computeHandMoments, primaryMoment, displayMoment, type HandMoment } from "@/features/card/hand-moments";
import type { TableSnapshot } from "@/parser/types";

function snap(partial: Partial<TableSnapshot>): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions: [], potTotal: 0, ...partial };
}

const M = (kind: HandMoment["kind"], group: HandMoment["group"], depth: HandMoment["depth"]): HandMoment => ({
  kind,
  group,
  depth,
});

describe("computeHandMoments", () => {
  it("пустой снимок → нет моментов (мусор, не показываем)", () => {
    expect(computeHandMoments(snap({}), 0)).toEqual([]);
  });

  it("не бросает на кривом снимке", () => {
    expect(() => computeHandMoments(snap({ actions: undefined as never }), -100)).not.toThrow();
  });
});

describe("primaryMoment — приоритет группы для главного типа", () => {
  it("пусто → null", () => {
    expect(primaryMoment([])).toBeNull();
  });

  it("спорное (CONTESTED) бьёт сильное, утечку, инициативу и кулер", () => {
    const moments = [
      M("LUCKY_WIN", "COOLER", "dialogue"),
      M("OPEN_WIDE", "LEAK", "mention"),
      M("SQUEEZE", "INITIATIVE", "dialogue"),
      M("WON_BLUFF", "STRONG", "dialogue"),
      M("BIG_FOLD", "CONTESTED", "dialogue"),
    ];
    expect(primaryMoment(moments)!.kind).toBe("BIG_FOLD");
  });

  it("без спорного главным становится сильный ход (похвала впереди утечек)", () => {
    const moments = [M("OPEN_WIDE", "LEAK", "mention"), M("WON_BLUFF", "STRONG", "dialogue")];
    expect(primaryMoment(moments)!.group).toBe("STRONG");
  });

  it("утечка впереди инициативы и кулера", () => {
    const moments = [M("COOLER", "COOLER", "note"), M("ISO", "INITIATIVE", "note"), M("LIMP", "LEAK", "mention")];
    expect(primaryMoment(moments)!.group).toBe("LEAK");
  });
});

// Разворот Артёма 2026-07-16: про отклонения от чарта молчим в каждой раздаче и копим их для
// сводки по дистанции. Метка игроку — только «интересное».
describe("displayMoment — частотные отклонения игроку не показываем", () => {
  it("раздача только с отклонением от чарта → метки нет", () => {
    const moments = [M("OPEN_WIDE", "LEAK", "mention"), M("LIMP", "LEAK", "mention")];
    expect(displayMoment(moments)).toBeNull();
  });

  it("флэт премиума вместо 3-бета тоже молчит (копится в сводку)", () => {
    expect(displayMoment([M("MISSED_3BET_VALUE", "LEAK", "mention")])).toBeNull();
  });

  it("интересное показываем, отклонение рядом не мешает", () => {
    const moments = [M("OPEN_WIDE", "LEAK", "mention"), M("BIG_FOLD", "CONTESTED", "dialogue")];
    expect(displayMoment(moments)!.kind).toBe("BIG_FOLD");
  });

  it("недобор велью — не отклонение от чарта, метку оставляем", () => {
    expect(displayMoment([M("MISSED_VALUE", "LEAK", "note")])!.kind).toBe("MISSED_VALUE");
  });
});

import { describe, it, expect } from "vitest";
import type { Position, TableAction, TableSnapshot } from "@/parser/types";
import { preflopAlternatives } from "@/parser/preflop-alternatives";

const P = (actor: string, action: TableAction["action"], amount?: number): TableAction =>
  ({ street: "PREFLOP", actor, action, amount });

function build(opts: {
  heroPos: Position;
  heroName: string;
  heroStack: number;
  cards: string[];
  acts: TableAction[];
}): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: opts.heroPos, positionName: opts.heroName, startingStack: opts.heroStack, seatNumber: 1 },
      { label: "Opener", position: "BTN", positionName: "BTN", startingStack: 5000, seatNumber: 2 },
      { label: "BBp", position: "BB", positionName: "BB", startingStack: 5000, seatNumber: 3 },
      { label: "SBp", position: "SB", positionName: "SB", startingStack: 5000, seatNumber: 4 },
    ],
    heroCards: opts.cards,
    board: [],
    tableSize: 8,
    buttonSeat: 2,
    potTotal: 0,
    actions: opts.acts,
  };
}

describe("preflopAlternatives — перед Hero один опен", () => {
  it("глубоко (50bb): флэт QQ против опена → ветка 3-БЕТ велью", () => {
    const s = build({
      heroPos: "CO",
      heroName: "CO",
      heroStack: 5000,
      cards: ["Qh", "Qd"],
      acts: [P("SBp", "POST_SB", 50), P("BBp", "POST_BB", 100), P("Opener", "RAISE", 210), P("Hero", "CALL", 210)],
    });
    const alt = preflopAlternatives(s);
    expect(alt?.altAction).toBe("THREE_BET");
    expect(alt?.chartState).toBe("THREEBET");
    expect(alt?.code).toBe("QQ");
  });

  it("глубоко: флэт 22 (сет-майнинг) против опена → молчим (холодный колл не судим)", () => {
    const s = build({
      heroPos: "CO",
      heroName: "CO",
      heroStack: 5000,
      cards: ["2h", "2d"],
      acts: [P("SBp", "POST_SB", 50), P("BBp", "POST_BB", 100), P("Opener", "RAISE", 210), P("Hero", "CALL", 210)],
    });
    expect(preflopAlternatives(s)).toBeNull();
  });

  it("коротко (12bb): фолд A5s против опена с BTN → ветка 3-БЕТ-ОЛЛ-ИН (рестил)", () => {
    const s = build({
      heroPos: "SB",
      heroName: "SB",
      heroStack: 1200,
      cards: ["As", "5s"],
      acts: [P("Hero", "POST_SB", 50), P("BBp", "POST_BB", 100), P("Opener", "RAISE", 210), P("Hero", "FOLD")],
    });
    const alt = preflopAlternatives(s);
    expect(alt?.altAction).toBe("THREE_BET_JAM");
    expect(["JAM", "JAM_WEIGHT"]).toContain(alt?.chartState);
  });

  it("коротко (12bb) первым в игру: мин-рейз AA → ветка ДЖЕМ по Nash", () => {
    const s = build({
      heroPos: "BTN",
      heroName: "BTN",
      heroStack: 1200,
      cards: ["Ah", "As"],
      acts: [P("SBp", "POST_SB", 50), P("BBp", "POST_BB", 100), P("Hero", "RAISE", 200)],
    });
    const alt = preflopAlternatives(s);
    expect(alt?.altAction).toBe("JAM");
    expect(alt?.chartState).toBe("ALWAYS");
  });

  it("глубоко: флэт AA против 3-бета (Hero открывался) → ветка 4-БЕТ велью", () => {
    const s = build({
      heroPos: "CO",
      heroName: "CO",
      heroStack: 5000,
      cards: ["Ah", "As"],
      acts: [
        P("SBp", "POST_SB", 50),
        P("BBp", "POST_BB", 100),
        P("Hero", "RAISE", 210),
        P("Opener", "RAISE", 630),
        P("SBp", "FOLD"),
        P("BBp", "FOLD"),
        P("Hero", "CALL", 420),
      ],
    });
    const alt = preflopAlternatives(s);
    expect(alt?.altAction).toBe("FOUR_BET");
    expect(alt?.chartState).toBe("FOURBET");
    expect(alt?.code).toBe("AA");
  });
});

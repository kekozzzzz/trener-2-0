/**
 * Тесты детерминированного профиля оппонента (parser/opponent-profile.ts,
 * plans/2026-07-01-профиль-оппонента.md). Чистые функции.
 *
 * Покрывают: гейт по выборке (UNKNOWN/tentative/solid), VPIP/PFR/лимп по действиям,
 * 5 архетипов, PFR через опен-пуш, склейку по opponentToken (а не по позиционной метке),
 * и profileHandOpponents (профили злодеев текущей раздачи, UNKNOWN отсеян).
 */

import { describe, it, expect } from "vitest";
import type { TableAction, TableSnapshot } from "@/parser/types";
import { classifyOpponent, profileHandOpponents } from "@/parser/opponent-profile";

const VTOK = "villain-token";

type Vill = "FOLD" | "CALL" | "RAISE" | "ALLIN" | "ABSENT";

// Раздача с одним добровольным действием оппонента «Villain» (токен VTOK) или его отсутствием.
function hand(vill: Vill): { tableData: TableSnapshot } {
  const seats = [
    { label: "Hero", position: "BTN" as const, startingStack: 4000 },
    { label: "Villain", position: "CO" as const, startingStack: 4000, opponentToken: VTOK },
    { label: "P3", position: "SB" as const, startingStack: 4000 },
    { label: "P4", position: "BB" as const, startingStack: 4000 },
  ];
  const actions: TableAction[] = [
    { street: "PREFLOP", actor: "P3", action: "POST_SB", amount: 50 },
    { street: "PREFLOP", actor: "P4", action: "POST_BB", amount: 100 },
  ];
  const base = { heroCards: ["Ac", "Kc"], board: [], potTotal: 0 };
  if (vill === "ABSENT") {
    return { tableData: { seats: seats.filter((s) => s.label !== "Villain"), actions, ...base } };
  }
  const map = { FOLD: "FOLD", CALL: "CALL", RAISE: "RAISE", ALLIN: "ALL_IN" } as const;
  const amount = vill === "RAISE" ? 250 : vill === "CALL" ? 100 : vill === "ALLIN" ? 4000 : undefined;
  actions.push({ street: "PREFLOP", actor: "Villain", action: map[vill], amount });
  return { tableData: { seats, actions, ...base } };
}

const many = (v: Vill, n: number) => Array.from({ length: n }, () => hand(v));

describe("classifyOpponent", () => {
  it("мало рук → UNKNOWN", () => {
    const p = classifyOpponent(many("CALL", 5), VTOK);
    expect(p.type).toBe("UNKNOWN");
    expect(p.confidence).toBe("none");
    expect(p.handsObserved).toBe(5);
  });

  it("FISH: высокий VPIP, низкий PFR (лузо-пассив)", () => {
    const p = classifyOpponent([...many("CALL", 20), ...many("RAISE", 2), ...many("FOLD", 8)], VTOK);
    expect(p.vpip).toBeCloseTo(73.3, 1);
    expect(p.pfr).toBeCloseTo(6.7, 1);
    expect(p.type).toBe("FISH");
    expect(p.confidence).toBe("solid");
  });

  it("NIT: низкий VPIP, пассив", () => {
    const p = classifyOpponent([...many("CALL", 3), ...many("FOLD", 27)], VTOK);
    expect(p.vpip).toBe(10);
    expect(p.type).toBe("NIT");
  });

  it("REG/TAG: средний VPIP, малый разрыв", () => {
    const p = classifyOpponent([...many("RAISE", 6), ...many("CALL", 1), ...many("FOLD", 23)], VTOK);
    expect(p.type).toBe("REG");
  });

  it("LAG: высокий VPIP и высокий PFR", () => {
    const p = classifyOpponent([...many("RAISE", 15), ...many("CALL", 3), ...many("FOLD", 12)], VTOK);
    expect(p.vpip).toBe(60);
    expect(p.pfr).toBe(50);
    expect(p.type).toBe("LAG");
  });

  it("12–24 рук → тип, confidence tentative", () => {
    const p = classifyOpponent([...many("CALL", 10), ...many("FOLD", 5)], VTOK);
    expect(p.handsObserved).toBe(15);
    expect(p.confidence).toBe("tentative");
    expect(p.type).toBe("FISH");
  });

  it("опен-пуш (первый олл-ин) считается агрессией в PFR", () => {
    const p = classifyOpponent(many("ALLIN", 12), VTOK);
    expect(p.vpip).toBe(100);
    expect(p.pfr).toBe(100);
  });

  it("склейка по токену: раздачи без места с этим токеном не считаются", () => {
    const p = classifyOpponent([...many("CALL", 5), ...many("ABSENT", 4)], VTOK);
    expect(p.handsObserved).toBe(5);
  });
});

describe("profileHandOpponents", () => {
  it("даёт профиль злодея текущей раздачи (в банке) по рукам ДО неё; UNKNOWN отсеян", () => {
    const prior = [...many("CALL", 20), ...many("RAISE", 2), ...many("FOLD", 8)]; // Villain = FISH
    const current = hand("CALL").tableData; // Villain добровольно вошёл в текущей
    const facts = profileHandOpponents(prior, current);
    expect(facts).toHaveLength(1);
    expect(facts[0].seatLabel).toBe("Villain");
    expect(facts[0].type).toBe("FISH");
    expect(facts[0].confidence).toBe("solid");
  });

  it("злодея, который просто сфолдил в текущей, не профилируем (не в банке)", () => {
    const prior = [...many("CALL", 20), ...many("RAISE", 2), ...many("FOLD", 8)];
    const current = hand("FOLD").tableData;
    expect(profileHandOpponents(prior, current)).toHaveLength(0);
  });

  it("мало прошлых рук → UNKNOWN → в фактах пусто", () => {
    const current = hand("CALL").tableData;
    expect(profileHandOpponents(many("CALL", 5), current)).toHaveLength(0);
  });
});

describe("classifyOpponent — прошлые вскрытия (публичный ридс)", () => {
  it("собирает руки, с которыми оппонент доходил до вскрытия раньше", () => {
    const withShow = (cards: [string, string]) => {
      const h = hand("CALL");
      const v = h.tableData.seats.find((s) => s.label === "Villain")!;
      (v as { shownCards?: string[] }).shownCards = cards;
      return h;
    };
    const hands = [withShow(["Ah", "Kd"]), withShow(["7c", "2c"]), ...many("CALL", 8)];
    const p = classifyOpponent(hands, VTOK);
    expect(p.shownHands).toContain("AKo");
    expect(p.shownHands).toContain("72s");
  });
});

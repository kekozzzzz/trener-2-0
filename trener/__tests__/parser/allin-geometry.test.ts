import { describe, it, expect } from "vitest";
import { detectAllInGeometry, renderAllInGeometry } from "@/parser/allin-geometry";
import type { TableSnapshot } from "@/parser/types";

function snap(partial: Partial<TableSnapshot>): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions: [], potTotal: 0, ...partial };
}

// bb = 1000 фишек, так что «фишки / 1000 = BB» читается прямо.
const BB = 1000;

// Hero (BTN, 29.2 BB) ре-пушит поверх олл-ина CO (12.6 BB); позади живы SB (28.8) и BB (40).
const rejam = snap({
  seats: [
    { label: "Hero", position: "BTN", positionName: "BTN", startingStack: 29200 },
    { label: "Player C", position: "CO", positionName: "CO", startingStack: 12600 },
    { label: "Player S", position: "SB", positionName: "SB", startingStack: 28800 },
    { label: "Player B", position: "BB", positionName: "BB", startingStack: 40000 },
  ],
  actions: [
    { street: "PREFLOP", actor: "Player C", action: "POST_ANTE", amount: 100 },
    { street: "PREFLOP", actor: "Hero", action: "POST_ANTE", amount: 100 },
    { street: "PREFLOP", actor: "Player S", action: "POST_ANTE", amount: 100 },
    { street: "PREFLOP", actor: "Player B", action: "POST_ANTE", amount: 100 },
    { street: "PREFLOP", actor: "Player S", action: "POST_SB", amount: 500 },
    { street: "PREFLOP", actor: "Player B", action: "POST_BB", amount: BB },
    { street: "PREFLOP", actor: "Player C", action: "ALL_IN", amount: 12600 },
    { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 29200 },
  ],
});

describe("allin-geometry — фаза 3: геометрия ре-пуша", () => {
  it("эффективный риск = стек короткого, излишек возвращается", () => {
    const g = detectAllInGeometry(rejam)!;
    expect(g).toBeTruthy();
    expect(g.heroRiskBb).toBe(29.2);
    expect(g.shortAllInBb).toBe(12.6);
    expect(g.effectiveRiskBb).toBe(12.6);
    expect(g.excessBb).toBe(16.6);
  });

  it("мёртвые деньги = банк до шова минус вклад уже вошедшего короткого", () => {
    const g = detectAllInGeometry(rejam)!;
    // pot до шова = анте 400 + SB 500 + BB 1000 + CO-рейз 12500 = 14400; минус вклад CO 12600
    // (его анте 100 входит в его же 12600, не в мёртвые деньги) = 1800 → 1.8 BB.
    expect(g.deadMoneyBb).toBe(1.8);
  });

  it("живые позади: SB покрывает почти весь стек, BB покрывает целиком", () => {
    const g = detectAllInGeometry(rejam)!;
    const sb = g.liveBehind.find((p) => p.label === "SB")!;
    const bb = g.liveBehind.find((p) => p.label === "BB")!;
    expect(sb.stackBb).toBe(28.8);
    expect(sb.covers).toBe(false); // 28.8 < 29.2
    expect(bb.covers).toBe(true); // 40 ≥ 29.2
  });

  it("строка называет короткого невыбиваемым и перечисляет живых позади", () => {
    const line = renderAllInGeometry(rejam)!;
    expect(line).toContain("ре-пушем его не выбить");
    expect(line).toContain("излишек 16.6 BB возвращается");
    expect(line).toContain("SB 28.8 BB");
  });

  it("плоский колл (не ре-пуш) → null", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BTN", startingStack: 29200 },
        { label: "Player C", position: "CO", startingStack: 12600 },
        { label: "Player B", position: "BB", startingStack: 40000 },
      ],
      actions: [
        { street: "PREFLOP", actor: "Player B", action: "POST_BB", amount: BB },
        { street: "PREFLOP", actor: "Player C", action: "ALL_IN", amount: 12600 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 12600 },
      ],
    });
    expect(detectAllInGeometry(s)).toBeNull();
  });

  it("опен-шов первым в банк (никого в олл-ине впереди) → null", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BTN", startingStack: 12000 },
        { label: "Player B", position: "BB", startingStack: 40000 },
      ],
      actions: [
        { street: "PREFLOP", actor: "Player B", action: "POST_BB", amount: BB },
        { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 12000 },
      ],
    });
    expect(detectAllInGeometry(s)).toBeNull();
  });
});

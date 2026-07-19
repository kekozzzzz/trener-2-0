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

  it("мёртвые деньги = банк до шова минус вклад короткого И минус вклад самого Hero", () => {
    const g = detectAllInGeometry(rejam)!;
    // pot до шова = анте 400 + SB 500 + BB 1000 + CO-рейз 12500 = 14400; минус вклад CO 12600
    // (его анте 100 входит в его же 12600), минус вклад самого Hero (анте 100 — свои фишки не
    // «забирает») = 1700 → 1.7 BB. (Раньше вклад Hero не вычитался и было 1.8 — на линии
    // «Hero открыл рейзом → ре-пуш» это ложно раздувало мёртвые деньги.)
    expect(g.deadMoneyBb).toBe(1.7);
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

  // Регресс (Артём, раздачи ATs и AJs-vs-AKs): Hero СНАЧАЛА открыл рейзом, потом в него олл-ин,
  // потом Hero ре-пушнул. Раньше гейт возвращал null (ловил только «холодный» шов первым ходом),
  // и тренер писал «забрать банк сразу» без факта, что короткого не выбить.
  it("открыл рейзом → в него олл-ин → Hero ре-пуш: геометрия срабатывает", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BTN", positionName: "BTN", startingStack: 30000 },
        { label: "Player S", position: "SB", positionName: "SB", startingStack: 12000 },
        { label: "Player B", position: "BB", positionName: "BB", startingStack: 40000 },
      ],
      actions: [
        { street: "PREFLOP", actor: "Player S", action: "POST_SB", amount: 500 },
        { street: "PREFLOP", actor: "Player B", action: "POST_BB", amount: BB },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 2000 }, // открыл
        { street: "PREFLOP", actor: "Player S", action: "ALL_IN", amount: 12000 }, // в него олл-ин
        { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 30000 }, // ре-пуш
      ],
    });
    const g = detectAllInGeometry(s)!;
    expect(g).toBeTruthy();
    expect(g.heroRiskBb).toBe(30);
    expect(g.effectiveRiskBb).toBe(12); // против короткого матчится только его 12 BB
    expect(g.excessBb).toBe(18); // излишек возвращается
    expect(g.shortAllInBb).toBe(12);
    expect(g.deadMoneyBb).toBe(1); // только BB 1000; рейз Hero 2000 НЕ в мёртвых деньгах
    expect(g.liveBehind.find((p) => p.label === "BB")!.covers).toBe(true);
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

  // Аудит румов 18.07: ВСЕ румы пишут плоский КОЛЛ чужого олл-ина тем же action="ALL_IN", что и пуш.
  // Раньше геометрия «твоего ре-пуша» выходила и на таком колле — ложный факт: Hero доложил
  // последним, фолд-эквити у него ноль, «забрать банк без вскрытия» невозможно. Воспроизведено на
  // реальном файле GG20260618-1715 (Hero: calls 21,076 and is all-in против рейза to 33,995).
  it("плоский КОЛЛ чужого олл-ина (записан как ALL_IN) — геометрии ре-пуша НЕТ", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BTN", positionName: "BTN", startingStack: 24276 },
        { label: "Player C", position: "CO", positionName: "CO", startingStack: 33995 },
        { label: "Player B", position: "BB", positionName: "BB", startingStack: 40000 },
      ],
      actions: [
        { street: "PREFLOP", actor: "Player B", action: "POST_BB", amount: BB },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 3000 },
        { street: "PREFLOP", actor: "Player C", action: "ALL_IN", amount: 33995 }, // рейз-олл-ин
        { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 21076 }, // ДОЛОЖИЛ меньше = колл
      ],
    });
    expect(detectAllInGeometry(s)).toBeNull();
  });

  // Обратная сторона: настоящий ре-пуш ПОВЕРХ чужого олл-ина геометрию давать обязан (не пересушили).
  it("настоящий ре-пуш поверх чужого олл-ина — геометрия остаётся", () => {
    expect(detectAllInGeometry(rejam)).not.toBeNull();
  });
});

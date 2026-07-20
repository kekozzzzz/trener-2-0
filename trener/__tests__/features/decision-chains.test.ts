/**
 * Цепочки решений (features/profile/decision-chains.ts) — где деньги утекают систематически.
 *
 * Идея Артёма 20.07: «открылся широко → в тебя 3-бет → ты сбросил» стоит РОВНО размер открытия,
 * дисперсии нет. Так деньги становятся честным числом там, где реализованный результат — шум.
 *
 * ⚠️Главное, что проверяем: сумма брошенных фишек НЕ показывается, пока вердикт не «за нормой».
 * Сбрасывать после промаха — обычный покер; голая сумма без нормы пугает игрока здоровой
 * статистикой, а это ровно то, с чем продукт борется.
 */

import { describe, it, expect } from "vitest";
import type { TableAction, TableSnapshot } from "@/parser/types";
import { computeDecisionChains, renderDecisionChainsFact } from "@/features/profile/decision-chains";
import { chainVerdict, MIN_SAMPLE_FOR_VERDICT } from "@/config/poker/decision-chains";

// Раздача: Hero открывает 2 BB с CO, соперник 3-бетит, Hero отвечает reply.
function openVs3bet(reply: "FOLD" | "CALL"): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: "CO", positionName: "CO", startingStack: 4000, seatNumber: 1 },
      { label: "Opp", position: "BTN", positionName: "BTN", startingStack: 4000, seatNumber: 2 },
      { label: "BBp", position: "BB", positionName: "BB", startingStack: 4000, seatNumber: 3 },
    ],
    heroCards: ["Ah", "Qd"],
    board: [],
    potTotal: 0,
    actions: [
      { street: "PREFLOP", actor: "BBp", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 200 },
      { street: "PREFLOP", actor: "Opp", action: "RAISE", amount: 600 },
      { street: "PREFLOP", actor: "Hero", action: reply, ...(reply === "CALL" ? { amount: 400 } : {}) },
    ] as TableAction[],
  };
}

// Раздача: Hero заплатил префлоп, на флопе в него поставили, он отвечает reply.
function paidThenFlopBet(reply: "FOLD" | "CALL"): TableSnapshot {
  return {
    seats: [
      { label: "Hero", position: "BB", positionName: "BB", startingStack: 4000, seatNumber: 1 },
      { label: "Opp", position: "BTN", positionName: "BTN", startingStack: 4000, seatNumber: 2 },
    ],
    heroCards: ["Kh", "Qd"],
    board: ["2c", "7h", "9s"],
    potTotal: 0,
    actions: [
      { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Opp", action: "RAISE", amount: 250 },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 150 },
      { street: "FLOP", actor: "Hero", action: "CHECK" },
      { street: "FLOP", actor: "Opp", action: "BET", amount: 300 },
      { street: "FLOP", actor: "Hero", action: reply, ...(reply === "CALL" ? { amount: 300 } : {}) },
    ] as TableAction[],
  };
}

describe("computeDecisionChains — арифметика вложенного и брошенного", () => {
  it("фолд на 3-бет считается вместе с точной ценой открытия", () => {
    const stats = computeDecisionChains([openVs3bet("FOLD"), openVs3bet("CALL")]);
    const c = stats.find((s) => s.id === "FOLD_TO_3BET")!;
    expect(c.faced).toBe(2);
    expect(c.folded).toBe(1);
    expect(c.foldPct).toBe(50);
    expect(c.abandonedBb).toBe(2); // открытие 200 при BB=100 = ровно 2 BB
  });

  it("фолд на флопе считает ИМЕННО вложенное на префлопе", () => {
    const stats = computeDecisionChains([paidThenFlopBet("FOLD")]);
    const c = stats.find((s) => s.id === "FOLD_FLOP_BET")!;
    expect(c.faced).toBe(1);
    expect(c.folded).toBe(1);
    expect(c.abandonedBb).toBe(2); // 100 (блайнд) + 150 (доплата) = 250 → 2.5, округляется до 2
  });

  it("ситуации не было — знаменатель ноль, доли нет, вердикт не выносим", () => {
    const stats = computeDecisionChains([]);
    for (const s of stats) {
      expect(s.faced).toBe(0);
      expect(s.foldPct).toBeNull();
      expect(s.verdict).toBe("TOO_FEW");
    }
  });
});

describe("chainVerdict — приговор только когда данных хватает", () => {
  it("мало наблюдений — вердикта нет, даже при диком перекосе", () => {
    expect(chainVerdict("FOLD_TO_3BET", 10, 10)).toBe("TOO_FEW");
  });

  it("в пределах нормы", () => {
    expect(chainVerdict("FOLD_TO_3BET", 55, 100)).toBe("NORM");
  });

  it("выше нормы, но ещё не эксплуатируемо — граница", () => {
    expect(chainVerdict("FOLD_TO_3BET", 62, 100)).toBe("BORDER");
  });

  it("эксплуатируемая частота — утечка", () => {
    expect(chainVerdict("FOLD_TO_3BET", 70, 100)).toBe("LEAK");
  });

  it("порог выборки не занижен (на десятке случаев доля скачет)", () => {
    expect(MIN_SAMPLE_FOR_VERDICT).toBeGreaterThanOrEqual(50);
  });
});

describe("renderDecisionChainsFact — деньги только при утечке", () => {
  const stat = (verdict: "NORM" | "LEAK", folded: number, faced: number) =>
    computeDecisionChains(
      Array.from({ length: faced }, (_, i) => openVs3bet(i < folded ? "FOLD" : "CALL")),
    );

  it("при норме сумма брошенных BB НЕ называется и утечка не выдумывается", () => {
    const out = renderDecisionChainsFact(stat("NORM", 55, 100));
    expect(out).toContain("В НОРМЕ");
    // Проверяем МЕТКУ вердикта («— ЗА НОРМОЙ»), а не слово: оно есть и в строке-инструкции
    // («заводить разговор ТОЛЬКО при вердикте „ЗА НОРМОЙ“»), иначе тест ложно падает.
    expect(out).not.toContain("— ЗА НОРМОЙ");
    expect(out).not.toMatch(/брошено \d+ BB/);
  });

  it("при утечке деньги называются", () => {
    const out = renderDecisionChainsFact(stat("LEAK", 70, 100));
    expect(out).toContain("ЗА НОРМОЙ");
    expect(out).toMatch(/брошено \d+ BB/);
  });

  it("тренеру прямо запрещено заводить разговор при норме и границе", () => {
    const out = renderDecisionChainsFact(stat("NORM", 55, 100));
    expect(out).toContain("ТОЛЬКО при вердикте «ЗА НОРМОЙ»");
    expect(out).toContain("не выдумывай проблему");
  });

  it("данных не хватает — строки нет вовсе (не молчим о том, чего не считали)", () => {
    expect(renderDecisionChainsFact(computeDecisionChains([openVs3bet("FOLD")]))).toBe("");
  });
});

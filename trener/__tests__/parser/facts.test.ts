import { describe, it, expect } from "vitest";
import { boardTexture, computeHandFacts, heroDraw } from "@/parser/facts";
import type { TableSnapshot } from "@/parser/types";

function snap(partial: Partial<TableSnapshot>): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions: [], potTotal: 0, ...partial };
}

describe("boardTexture", () => {
  it("монотонный флоп", () => {
    expect(boardTexture(["2h", "7h", "Kh"])?.suitedness).toBe("MONOTONE");
  });

  it("двухмастный и связанный", () => {
    const t = boardTexture(["8c", "9c", "Td"]);
    expect(t?.suitedness).toBe("TWO_TONE");
    expect(t?.connected).toBe("CONNECTED");
  });

  it("сухой разномастный несвязанный", () => {
    const t = boardTexture(["2c", "7h", "Kd"]);
    expect(t?.suitedness).toBe("RAINBOW");
    expect(t?.connected).toBe("DISCONNECTED");
    expect(t?.paired).toBe(false);
  });

  it("спаренный борд", () => {
    expect(boardTexture(["Kc", "Kh", "5d"])?.paired).toBe(true);
  });

  it("колесо: туз как низкая карта даёт связность", () => {
    expect(boardTexture(["Ah", "2c", "3d"])?.connected).toBe("CONNECTED");
  });

  it("до флопа борда нет", () => {
    expect(boardTexture(["Ah"])).toBeNull();
  });
});

describe("heroDraw — ауты и эквити", () => {
  it("флеш-дро: 9 аутов, эквити с флопа ≈36%", () => {
    const d = heroDraw(["Ah", "Kh"], ["2h", "7h", "Qs"]);
    expect(d?.kind).toBe("флеш-дро");
    expect(d?.outs).toBe(9);
    expect(d?.equityPct).toBe(36); // 9*4
  });

  it("двустороннее стрит-дро: 8 аутов", () => {
    const d = heroDraw(["8c", "9d"], ["7h", "Ts", "2c"]); // 7-8-9-T
    expect(d?.kind).toBe("двустороннее стрит-дро (ОЭСД)");
    expect(d?.outs).toBe(8);
  });

  it("гатшот: 4 аута", () => {
    const d = heroDraw(["8c", "Td"], ["7h", "Js", "2c"]); // 7-8-_-T-J, не хватает 9
    expect(d?.kind).toBe("гатшот");
    expect(d?.outs).toBe(4);
  });

  it("комбо флеш+стрит: ауты как объединение без двойного счёта", () => {
    const d = heroDraw(["8h", "9h"], ["7h", "Th", "2c"]); // флеш-дро h + ОЭСД 7-8-9-T
    expect(d?.kind).toContain("флеш-дро");
    expect(d?.kind).toContain("ОЭСД");
    // 9 флеш + 8 стрит − 2 пересечения (6h, Jh уже в флеш-аутах) = 15
    expect(d?.outs).toBe(15);
  });

  it("колесо: A-2-3-4 — 4 аута на пятёрку (одностороннее)", () => {
    const d = heroDraw(["Ah", "2c"], ["3d", "4s", "Kh"]);
    expect(d?.outs).toBe(4);
    expect(d?.kind).toBe("гатшот");
  });

  it("на тёрне эквити по правилу 2 (одна карта)", () => {
    const d = heroDraw(["Ah", "Kh"], ["2h", "7h", "Qs", "3c"]); // флеш-дро, 4 карты борда
    expect(d?.outs).toBe(9);
    expect(d?.equityPct).toBe(18); // 9*2
  });

  it("готовый флеш — это не дро", () => {
    expect(heroDraw(["Ah", "Kh"], ["2h", "7h", "Qh"])).toBeNull();
  });

  it("стрит-дро целиком на доске, без участия Hero — не дро Hero", () => {
    // борд 7-8-9-T уже ОЭСД сам по себе; карты Hero не расширяют набор
    expect(heroDraw(["Ac", "Kd"], ["7h", "8s", "9c", "Td"])).toBeNull();
  });

  it("на ривере дро нет", () => {
    expect(heroDraw(["Ah", "Kh"], ["2h", "7h", "Qs", "3c", "9d"])).toBeNull();
  });

  it("нет дро — null", () => {
    expect(heroDraw(["Ah", "Kd"], ["2c", "7s", "Qh"])).toBeNull();
  });
});

describe("computeHandFacts — арифметика банка", () => {
  // Hero BB (20), Player2 BTN бетит полбанка на флопе, Hero перед решением.
  const s = snap({
    seats: [
      { label: "Hero", position: "BB", startingStack: 1000 },
      { label: "Player 2", position: "BTN", startingStack: 1000 },
    ],
    board: ["2c", "7h", "Kd"],
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 10 },
      { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 20 },
      { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 60 },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 40 },
      // банк к флопу = 120
      { street: "FLOP", actor: "Hero", action: "CHECK" },
      { street: "FLOP", actor: "Player 2", action: "BET", amount: 60 },
      { street: "FLOP", actor: "Hero", action: "FOLD" },
    ],
  });

  const f = computeHandFacts(s);

  it("стек в больших блайндах", () => {
    expect(f.heroStackBb).toBe(50); // 1000 / 20
  });

  it("SPR на флопе: остаток 940 / банк 120 ≈ 7.8", () => {
    expect(f.sprFlop).toBe(7.8);
  });

  it("ставка соперника на флопе — половина банка", () => {
    const flopBet = f.bets.find((b) => b.street === "FLOP");
    expect(flopBet?.sizePctOfPot).toBe(50); // 60 в банк 120
  });

  it("пот-оддс Hero: доложить 60 в банк 180 → ≈25%", () => {
    const facing = f.heroFacing.find((h) => h.street === "FLOP");
    expect(facing?.toCall).toBe(60);
    expect(facing?.equityToCallPct).toBe(25); // 60 / (180 + 60) = 0.25
  });

  it("текстура борда определена", () => {
    expect(f.texture?.suitedness).toBe("RAINBOW");
  });

  it("сайзинг в долях банка не репортится на префлопе", () => {
    expect(f.bets.some((b) => b.street === "PREFLOP")).toBe(false);
    expect(f.heroBets.some((b) => b.street === "PREFLOP")).toBe(false);
  });
});

describe("computeHandFacts — фолд-эквити для бета Hero", () => {
  const s = snap({
    seats: [
      { label: "Hero", position: "BTN", startingStack: 1000 },
      { label: "Player 2", position: "BB", startingStack: 1000 },
    ],
    board: ["2c", "7h", "Kd"],
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 20 },
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 60 },
      { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 40 },
      // банк к флопу = 120
      { street: "FLOP", actor: "Player 2", action: "CHECK" },
      { street: "FLOP", actor: "Hero", action: "BET", amount: 60 },
    ],
  });

  it("бет Hero 60 в банк 120 = 50%, фолд нужен чаще 33%", () => {
    const f = computeHandFacts(s);
    const heroBet = f.heroBets.find((b) => b.street === "FLOP");
    expect(heroBet?.sizePctOfPot).toBe(50);
    expect(heroBet?.foldsNeededPct).toBe(33); // 60 / (120 + 60)
  });
});

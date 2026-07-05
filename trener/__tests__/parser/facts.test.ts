import { describe, it, expect } from "vitest";
import { boardTexture, computeHandFacts, renderHandFacts } from "@/parser/facts";
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

  // Правка Артёма 2026-07-05: одна текстура по итоговому борду утекала в более ранние
  // точки решения («на тёрне доска монотонная», когда третью масть принёс ривер).
  it("текстура в фактах — по улицам, ривер не утекает в тёрн", () => {
    const withRiver = snap({
      seats: s.seats,
      heroCards: ["Td", "8d"],
      // флоп разномастный; тёрн вторая черва; ривер третья черва + пара девяток
      board: ["6s", "Qh", "9d", "7h", "9h"],
      actions: s.actions,
    });
    const text = renderHandFacts(withRiver);
    expect(text).toContain("Текстура борда на флопе: разномастный");
    expect(text).toContain("Текстура борда на тёрне: две одной масти");
    expect(text).toMatch(/Текстура борда на ривере: три и более одной масти[^\n]*спаренный/);
    // старой единой строки «Текстура борда:» без улицы больше нет
    expect(text).not.toMatch(/Текстура борда: /);
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

describe("computeHandFacts — класс размера ставки", () => {
  function flopBetSnap(betAmount: number): TableSnapshot {
    return snap({
      seats: [
        { label: "Hero", position: "BTN", startingStack: 100000 },
        { label: "Player 2", position: "BB", startingStack: 100000 },
      ],
      board: ["2c", "7h", "Kd"],
      actions: [
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 60 },
        { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 40 },
        // банк к флопу = 120
        { street: "FLOP", actor: "Player 2", action: "CHECK" },
        { street: "FLOP", actor: "Hero", action: "BET", amount: betAmount },
      ],
    });
  }

  it("≈25% банка → мелкая", () => {
    expect(computeHandFacts(flopBetSnap(30)).heroBets[0]?.sizeClass).toBe("SMALL");
  });
  it("50% банка → стандарт", () => {
    expect(computeHandFacts(flopBetSnap(60)).heroBets[0]?.sizeClass).toBe("STANDARD");
  });
  it("пот-сайз (100%) → крупная", () => {
    expect(computeHandFacts(flopBetSnap(120)).heroBets[0]?.sizeClass).toBe("LARGE");
  });
  it("больше банка → овербет", () => {
    expect(computeHandFacts(flopBetSnap(180)).heroBets[0]?.sizeClass).toBe("OVERBET");
  });
});

describe("computeHandFacts — обратные оддсы при защите с дро", () => {
  // Hero BB с флеш-дро A♥K♥ на 2♥7♥Q♠; BTN бетит в банк, прямых оддсов не хватает.
  const s = snap({
    seats: [
      { label: "Hero", position: "BB", startingStack: 100000 },
      { label: "Player 2", position: "BTN", startingStack: 100000 },
    ],
    heroCards: ["Ah", "Kh"],
    board: ["2h", "7h", "Qs"],
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 10 },
      { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 20 },
      { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 60 },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 40 },
      // банк к флопу = 120
      { street: "FLOP", actor: "Hero", action: "CHECK" },
      { street: "FLOP", actor: "Player 2", action: "BET", amount: 120 }, // овербет: банк станет 240, доложить 120
      { street: "FLOP", actor: "Hero", action: "CALL", amount: 120 },
    ],
  });

  const facing = computeHandFacts(s).heroFacing.find((h) => h.street === "FLOP");

  it("эквити дро = чистое на ОДНУ карту (обычный бет, не олл-ин)", () => {
    // 8 чистых аутов из 47 ≈ 17% (Q♥ грязная, спаривает борд)
    expect(facing?.drawEquityPct).toBe(17);
  });

  it("прямой пот-оддс 33%, дро 17% (одна карта) — нужен добор", () => {
    // toCall 120, банк после бета 240 → 120/360 = 33%; 17% < 33% → добор нужен
    // X = 120/0.17 − 240 − 120 ≈ 346
    expect(facing?.equityToCallPct).toBe(33);
    expect(facing?.impliedExtraNeeded).toBe(346);
  });
});

describe("computeHandFacts — имплайды, когда прямых оддсов мало", () => {
  // Та же рука, но соперник пушит овербет так, что прямых оддсов не хватает.
  const s = snap({
    seats: [
      { label: "Hero", position: "BB", startingStack: 100000 },
      { label: "Player 2", position: "BTN", startingStack: 100000 },
    ],
    heroCards: ["Ah", "Kh"],
    board: ["2h", "7h", "Qs"],
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 10 },
      { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 20 },
      { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 60 },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 40 },
      // банк к флопу = 120
      { street: "FLOP", actor: "Hero", action: "CHECK" },
      { street: "FLOP", actor: "Player 2", action: "BET", amount: 300 }, // банк станет 420, доложить 300
      { street: "FLOP", actor: "Hero", action: "CALL", amount: 300 },
    ],
  });

  const facing = computeHandFacts(s).heroFacing.find((h) => h.street === "FLOP");

  it("прямых оддсов не хватает → есть добор при попадании", () => {
    // p=0.17 (8 чистых аутов на одну карту), toCall=300, банк после бета=420
    // → X = 300/0.17 − 420 − 300 ≈ 1045
    expect(facing?.equityToCallPct).toBe(42); // 300/(420+300)
    expect(facing?.impliedExtraNeeded).toBe(1045);
  });
});

describe("computeHandFacts — полу-блеф Hero собирает банк при доезде", () => {
  const s = snap({
    seats: [
      { label: "Hero", position: "BTN", startingStack: 100000 },
      { label: "Player 2", position: "BB", startingStack: 100000 },
    ],
    heroCards: ["Ah", "Kh"],
    board: ["2h", "7h", "Qs"],
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 20 },
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 60 },
      { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 40 },
      // банк к флопу = 120
      { street: "FLOP", actor: "Player 2", action: "CHECK" },
      { street: "FLOP", actor: "Hero", action: "BET", amount: 120 }, // пот-сайз с флеш-дро = полу-блеф
    ],
  });

  const heroBet = computeHandFacts(s).heroBets.find((b) => b.street === "FLOP");

  it("эквити дро и банк при колле посчитаны", () => {
    // полу-блеф: сила дро к РИВЕРУ (2 карты), чистое флеш-дро (+бэкдор-бродвей) ≈ 23%
    expect(heroBet?.drawEquityPct).toBeGreaterThanOrEqual(20);
    expect(heroBet?.drawEquityPct).toBeLessThanOrEqual(36);
    expect(heroBet?.potIfCalled).toBe(360); // 120 + 2*120
    expect(heroBet?.sizeClass).toBe("LARGE"); // 120/120 = 100%
  });
});

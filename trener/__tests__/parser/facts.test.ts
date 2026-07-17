import { describe, it, expect } from "vitest";
import { boardTexture, computeHandFacts, renderHandFacts, renderFlushSummary, renderShowdownFacts } from "@/parser/facts";
import type { Seat, TableAction, TableSnapshot } from "@/parser/types";

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

describe("computeHandFacts — баги расчёта из свипа 2026-07-12", () => {
  it("баг 1: цена колла ограничена остатком стека Hero при шове больше стека", () => {
    // Hero стек 1000, вложил префлоп 300 (остаток 700); соперник шовит 4700 на флопе.
    const s = snap({
      seats: [
        { label: "Hero", position: "BTN", startingStack: 1000 },
        { label: "Player 1", position: "BB", startingStack: 5000 },
      ],
      heroCards: ["Ah", "Kd"],
      board: ["2c", "7h", "Td"],
      actions: [
        { street: "PREFLOP", actor: "Hero", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Player 1", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 300 },
        { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 200 },
        { street: "FLOP", actor: "Player 1", action: "ALL_IN", amount: 4700 },
      ],
      potTotal: 2000,
    });
    const flop = computeHandFacts(s).heroFacing.find((h) => h.street === "FLOP");
    expect(flop).toBeDefined();
    expect(flop!.toCall).toBe(700); // остаток стека, а не весь шов 4700
    expect(flop!.equityToCallPct).toBe(35); // банк без непокрытого излишка (было бы 47)
  });

  it("баг 3: эффективный стек не считает сбросившегося до флопа крупного соперника", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BTN", startingStack: 10000 },
        { label: "Player 1", position: "SB", startingStack: 8000 }, // крупный, сбросит префлоп
        { label: "Player 2", position: "BB", startingStack: 2000 }, // живой коротыш
      ],
      heroCards: ["Ah", "Kd"],
      board: ["2c", "7h", "Td"],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 300 },
        { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 200 },
        { street: "FLOP", actor: "Player 2", action: "CHECK" },
        { street: "FLOP", actor: "Hero", action: "CHECK" },
      ],
      potTotal: 700,
    });
    // против живого коротыша 2000/100 = 20 BB, не против сброшенного SB (8000 → было бы 80)
    expect(computeHandFacts(s).effectiveStackBb).toBe(20);
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

describe("renderHandFacts — контекст-факты (свип 2026-07-12)", () => {
  it("уровень, мёртвые деньги, M-фактор, живые по улицам", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BTN", positionName: "BTN", startingStack: 3000 },
        { label: "Player 1", position: "BB", positionName: "BB", startingStack: 3000 },
        { label: "Player 2", position: "SB", positionName: "SB", startingStack: 3000 },
      ],
      heroCards: ["Ac", "Kd"],
      board: ["Kh", "7c", "2d", "9s"],
      level: 12,
      actions: [
        { street: "PREFLOP", actor: "Hero", action: "POST_ANTE", amount: 30 },
        { street: "PREFLOP", actor: "Player 1", action: "POST_ANTE", amount: 30 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_ANTE", amount: 30 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Player 1", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 },
        { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 150 },
        { street: "FLOP", actor: "Player 1", action: "CHECK" },
        { street: "FLOP", actor: "Hero", action: "CHECK" },
        { street: "TURN", actor: "Player 1", action: "CHECK" },
        { street: "TURN", actor: "Hero", action: "CHECK" },
      ],
      potTotal: 590,
    });
    const out = renderHandFacts(s);
    expect(out).toContain("Уровень блайндов турнира: 12");
    expect(out).toContain("Форсы (анте+блайнды) в банке на старте");
    // слово-термин «M-фактор» игроку не показываем — запас в кругах человеческими словами (2026-07-15)
    expect(out).toContain("Запас стека Hero: хватает на 12.5 кругов");
    expect(out).not.toContain("M-фактор Hero:");
    expect(out).toContain("на тёрн осталось");
  });
});

// Свип-факт 2: замазанность (pot-committed) — доля стека в банке, остаток после колла, олл-ин ли.
describe("computeHandFacts — замазанность (pot-committed)", () => {
  // Короткий Hero (200) вложил префлоп 80 (40%), на флопе перед бетом 80: остаток после колла 40 ≤ банк.
  const s = snap({
    seats: [
      { label: "Hero", position: "BB", startingStack: 200 },
      { label: "Player 2", position: "BTN", startingStack: 2000 },
    ],
    board: ["2c", "7h", "Kd"],
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 10 },
      { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 20 },
      { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 80 },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 60 },
      { street: "FLOP", actor: "Hero", action: "CHECK" },
      { street: "FLOP", actor: "Player 2", action: "BET", amount: 80 },
    ],
  });
  const facing = computeHandFacts(s).heroFacing.find((h) => h.street === "FLOP");

  it("доля вложенного стека и остаток после колла", () => {
    expect(facing?.committedBeforePct).toBe(40); // 80 / 200
    expect(facing?.remainingAfterCallBb).toBe(2); // (120 − 80) / 20
    expect(facing?.heroAllInOnCall).toBe(false);
    expect(facing?.potCommitted).toBe(true);
  });

  it("рендер называет замазанность числом, без приказа коллировать", () => {
    const out = renderHandFacts(s);
    expect(out).toContain("Ты уже вложил ≈40% стека");
    expect(out).toContain("SPR<1");
    expect(out).toContain("решай по эквити");
  });

  it("колл-в-олл-ин помечается как олл-ин, не как замазанность", () => {
    const allInSnap = snap({
      seats: [
        { label: "Hero", position: "BB", startingStack: 100 },
        { label: "Player 2", position: "BTN", startingStack: 2000 },
      ],
      board: ["2c", "7h", "Kd"],
      actions: [
        { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 40 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 20 },
        { street: "FLOP", actor: "Hero", action: "CHECK" },
        { street: "FLOP", actor: "Player 2", action: "BET", amount: 200 }, // перекрывает остаток Hero
      ],
    });
    const f = computeHandFacts(allInSnap).heroFacing.find((h) => h.street === "FLOP");
    expect(f?.heroAllInOnCall).toBe(true);
    expect(f?.potCommitted).toBe(false); // олл-ин не зовём «замазанностью»
    expect(renderHandFacts(allInSnap)).toContain("Колл ставит тебя в олл-ин");
  });

  // Ревью (интеграция MEDIUM): имплайд-оддсы советовали недостижимый добор рядом с «ты замазан».
  // Теперь если нужный добор больше остатка после колла — честно «по эквити это фолд».
  it("недостижимый добор: имплайды больше остатка → фолд, не совет добрать", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BB", startingStack: 20000 },
        { label: "Player 2", position: "BTN", startingStack: 40000 },
      ],
      heroCards: ["Ah", "2h"],
      board: ["Kh", "7h", "3c", "9s"],
      actions: [
        { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 500 },
        { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 1000 },
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 4000 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 3000 },
        { street: "FLOP", actor: "Hero", action: "CHECK" },
        { street: "FLOP", actor: "Player 2", action: "BET", amount: 4000 },
        { street: "FLOP", actor: "Hero", action: "CALL", amount: 4000 },
        { street: "TURN", actor: "Hero", action: "CHECK" },
        { street: "TURN", actor: "Player 2", action: "BET", amount: 8000 },
      ],
    });
    const facing = computeHandFacts(s).heroFacing.find((h) => h.street === "TURN");
    expect(facing?.impliedUnreachable).toBe(true);
    expect(facing?.potCommitted).toBe(true);
    // Тёрн-строка честно говорит «фолд» и НЕ советует добор (флоп-строка добор советует легитимно).
    const turnLine = renderHandFacts(s)
      .split("\n")
      .find((l) => l.startsWith("Решение Hero на TURN"))!;
    expect(turnLine).toContain("по эквити это фолд");
    expect(turnLine).not.toContain("доберёшь ещё");
  });
});

// Свип-факт 4: геометрия НЕ-олл-ин префлоп-агрессии — мёртвые деньги + break-even фолд-эквити.
describe("computeHandFacts — геометрия префлоп-агрессии", () => {
  it("опен: Hero рейзит первым, лимперов и рейзов до него нет", () => {
    const s = snap({
      seats: [
        { label: "Player 1", position: "SB", startingStack: 2000 },
        { label: "Player 2", position: "BB", startingStack: 2000 },
        { label: "Hero", position: "BTN", startingStack: 2000 },
      ],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 50 },
      ],
    });
    expect(computeHandFacts(s).preflopAgg).toEqual({
      riskBb: 2.5, // 50 / 20
      deadMoneyBb: 1.5, // (10 + 20) / 20
      foldsNeededPct: 63, // 50 / (30 + 50) ≈ 0.625
      kind: "опен",
    });
    expect(renderHandFacts(s)).toContain("Твой префлоп-опен: рискуешь 2.5 BB, в банке до тебя 1.5 BB");
  });

  it("изоляция: до Hero был лимпер", () => {
    const s = snap({
      seats: [
        { label: "Player 1", position: "SB", startingStack: 2000 },
        { label: "Player 2", position: "BB", startingStack: 2000 },
        { label: "Player 3", position: "EARLY", startingStack: 2000 },
        { label: "Hero", position: "BTN", startingStack: 2000 },
      ],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Player 3", action: "CALL", amount: 20 }, // лимп
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 80 },
      ],
    });
    expect(computeHandFacts(s).preflopAgg?.kind).toBe("изоляция");
  });

  it("3-бет: до Hero был рейз", () => {
    const s = snap({
      seats: [
        { label: "Player 1", position: "SB", startingStack: 2000 },
        { label: "Player 2", position: "BB", startingStack: 2000 },
        { label: "Player 3", position: "EARLY", startingStack: 2000 },
        { label: "Hero", position: "BTN", startingStack: 2000 },
      ],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Player 3", action: "RAISE", amount: 60 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 180 },
      ],
    });
    expect(computeHandFacts(s).preflopAgg?.kind).toBe("3-бет");
  });

  it("пуш (олл-ин) НЕ репортится как геометрия — покрыт push-fold", () => {
    const s = snap({
      seats: [
        { label: "Player 1", position: "SB", startingStack: 2000 },
        { label: "Player 2", position: "BB", startingStack: 2000 },
        { label: "Hero", position: "BTN", startingStack: 300 },
      ],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 300 },
      ],
    });
    expect(computeHandFacts(s).preflopAgg).toBeNull();
  });
});

// Свип-кандидат 5: геометрия второго барреля — SPR следующей улицы, если ставку заколлируют.
describe("computeHandFacts — геометрия второго барреля (nextStreetSpr)", () => {
  it("тёрн-бет коммитит стек: после колла SPR ривера ≤ 1", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BB", startingStack: 3000 },
        { label: "Player 2", position: "BTN", startingStack: 3000 },
      ],
      board: ["2c", "7h", "Kd", "9s"],
      actions: [
        { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 300 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 200 },
        { street: "FLOP", actor: "Hero", action: "BET", amount: 400 },
        { street: "FLOP", actor: "Player 2", action: "CALL", amount: 400 },
        { street: "TURN", actor: "Hero", action: "BET", amount: 1000 },
      ],
    });
    const turnBet = computeHandFacts(s).heroBets.find((b) => b.street === "TURN");
    expect(turnBet?.nextStreetSpr).toBeLessThanOrEqual(1);
    expect(turnBet?.commitsStack).toBe(true);
    expect(renderHandFacts(s)).toContain("уже коммитит стек");
  });

  it("глубокая мелкая ставка НЕ коммитит: SPR следующей улицы > 1", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BB", startingStack: 20000 },
        { label: "Player 2", position: "BTN", startingStack: 20000 },
      ],
      board: ["2c", "7h", "Kd"],
      actions: [
        { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 300 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 200 },
        { street: "FLOP", actor: "Hero", action: "BET", amount: 300 },
      ],
    });
    const flopBet = computeHandFacts(s).heroBets.find((b) => b.street === "FLOP");
    expect(flopBet?.nextStreetSpr).toBeGreaterThan(1);
    expect(flopBet?.commitsStack).toBe(false);
  });

  // Ревью доводок (MEDIUM): при чек-рейзе соперник докладывает МЕНЬШЕ risk (он уже вложил на
  // улице) → potIfCalled не должен считать «доложит ровно risk».
  it("чек-рейз: potIfCalled учитывает реальный до-колл соперника, не 2×risk", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BB", startingStack: 5000 },
        { label: "Player 2", position: "BTN", startingStack: 5000 },
      ],
      board: ["2c", "7h", "Kd"],
      actions: [
        { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 100 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 100 },
        // банк к флопу = 200
        { street: "FLOP", actor: "Hero", action: "CHECK" },
        { street: "FLOP", actor: "Player 2", action: "BET", amount: 100 }, // банк 300, вложил 100
        { street: "FLOP", actor: "Hero", action: "RAISE", amount: 300 }, // чек-рейз to 300, risk 300
      ],
    });
    const flopBet = computeHandFacts(s).heroBets.find((b) => b.street === "FLOP");
    // potIfCalled = potBefore(300) + risk(300) + oppCall(300−100=200) = 800, а не 300+2×300=900.
    expect(flopBet?.potIfCalled).toBe(800);
  });

  it("ривер-ставка: nextStreetSpr не считается (следующей улицы нет)", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BB", startingStack: 3000 },
        { label: "Player 2", position: "BTN", startingStack: 3000 },
      ],
      board: ["2c", "7h", "Kd", "9s", "3d"],
      actions: [
        { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
        { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 50 },
        { street: "PREFLOP", actor: "Hero", action: "CHECK" },
        { street: "FLOP", actor: "Hero", action: "CHECK" },
        { street: "FLOP", actor: "Player 2", action: "CHECK" },
        { street: "TURN", actor: "Hero", action: "CHECK" },
        { street: "TURN", actor: "Player 2", action: "CHECK" },
        { street: "RIVER", actor: "Hero", action: "BET", amount: 200 },
      ],
    });
    const riverBet = computeHandFacts(s).heroBets.find((b) => b.street === "RIVER");
    expect(riverBet?.nextStreetSpr).toBeUndefined();
  });
});

// Сводка флеш-угрозы (регресс #85/#53): детерминированный факт против выдуманного флеша/дро.
describe("renderFlushSummary", () => {
  it("#85: на РИВЕРЕ 4 карты масти без пятой → флеша НЕТ (дро не доехало)", () => {
    // A♦7♦ на 4♦8♦4♣4♠Q♥: 2 бубны на борде + 2 у Hero = 4, но ривер закрыт — флеша нет.
    const line = renderFlushSummary(["Ad", "7d"], ["4d", "8d", "4c", "4s", "Qh"]);
    expect(line).toContain("флеша НЕТ, не пиши, что собрал флеш");
  });
  it("#53: 3 карты масти на борде, у Hero НЕТ этой масти → своего флеша/дро нет", () => {
    const line = renderFlushSummary(["Kh", "9h"], ["Ac", "3c", "7c"]);
    expect(line).toContain("СВОЕГО флеша и флеш-дро у тебя НЕТ");
  });
  it("тёрн, у Hero 2 карты масти + 2 на борде = 4 → флеш-дро (ещё есть карта)", () => {
    const line = renderFlushSummary(["Kc", "9c"], ["Ac", "3c", "7h", "2s"]);
    expect(line).toContain("ФЛЕШ-ДРО");
  });
  it("5 карт масти (2 в руке + 3 на борде) → собран флеш", () => {
    const line = renderFlushSummary(["Kc", "9c"], ["Ac", "3c", "7c"]);
    expect(line).toContain("СОБРАН флеш");
  });
  it("на борде максимум 2 масти, у Hero мало → флеша нет ни у кого", () => {
    const line = renderFlushSummary(["Ad", "7s"], ["4d", "8d", "4c", "2h", "Qs"]);
    expect(line).toContain("флеша и флеш-дро НЕТ ни у тебя, ни у соперника");
  });
  it("флоп ещё не открыт (борд < 3) → строки нет", () => {
    expect(renderFlushSummary(["Kc", "9c"], [])).toBeNull();
  });
});

/**
 * Готовая рука на КАЖДОЙ улице + категория (правки 2026-07-16).
 * Зачем: раньше строка печаталась только когда рука МЕНЯЛАСЬ — собрал две пары на флопе, и на
 * тёрне/ривере факта не было вовсе, модель переносила его сама и путала («две пары» → «трипс»,
 * каре → «фулл»). Аудит 16.07 намерил на этом 15-16 грубых ошибок на модель.
 */
describe("готовая рука по улицам (антидедуп)", () => {
  it("рука не изменилась между улицами — строка всё равно есть на каждой", () => {
    // Две пары (валетов и восьмёрок) собраны на флопе и не меняются до ривера.
    const s = snap({ heroCards: ["Jh", "8c"], board: ["8s", "2d", "Jd", "5c", "3h"] });
    const made = renderHandFacts(s).split("\n").filter((l) => l.includes("Готовая рука Hero"));
    expect(made).toHaveLength(3); // флоп + тёрн + ривер, а не одна строка
    expect(made[0]).toContain("на флопе");
    expect(made[1]).toContain("на тёрне");
    expect(made[2]).toContain("на ривере");
  });

  it("категория комбинации названа по-русски, с местом в иерархии", () => {
    const s = snap({ heroCards: ["Jh", "8c"], board: ["8s", "2d", "Jd", "5c", "3h"] });
    const river = renderHandFacts(s).split("\n").filter((l) => l.includes("Готовая рука Hero")).at(-1)!;
    expect(river).toContain("две пары");
    expect(river).toContain("7-я сверху из 9");
    expect(river).toContain("другой комбинацией её не называй");
  });

  it("каре: категория и место — чтобы не назвали фуллом", () => {
    const s = snap({ heroCards: ["Th", "Td"], board: ["Ts", "Tc", "7h", "2d", "9s"] });
    const river = renderHandFacts(s).split("\n").filter((l) => l.includes("Готовая рука Hero")).at(-1)!;
    expect(river).toContain("каре");
    expect(river).toContain("2-я сверху из 9");
  });

  it("английский ключ категории в текст не утекает (его забракует латинский сторож)", () => {
    const s = snap({ heroCards: ["Jh", "8c"], board: ["8s", "2d", "Jd", "5c", "3h"] });
    const made = renderHandFacts(s).split("\n").filter((l) => l.includes("Готовая рука Hero")).join(" ");
    expect(made).not.toMatch(/TWO_PAIR|QUADS|FULL_HOUSE|TRIPS|STRAIGHT|FLUSH|HIGH|PAIR/);
  });
});

/**
 * Призрачные факты после фолда Hero (разбор 2026-07-17 — корень целого класса вранья).
 * Hero сбросил на префлопе, а факты изъявительным наклонением рассказывали, что было БЫ дальше:
 * «Готовая рука Hero на флопе: трипс троек», «на ривере: каре троек», «Расклады… ты впереди 1060».
 * Модель фактам ВЕРИТ и достраивает назад: «трипс троек? значит была карманная пара» → советует
 * сет-майнинг рукой T3o (регресс #25). Так же родились «на тёрне ты усилился до фулл-хауса» (#9)
 * и «борд в итоге дал тебе каре» (#34): 19 из 29 префлоп-фолдов, у ВСЕХ моделей.
 * Промпт запрещал это ОДНОЙ строкой и проигрывал дюжине строк-фактов. Режем у источника.
 */
describe("факты не рассказывают несыгранное будущее (heroSawStreet)", () => {
  const folded = (foldStreet: "PREFLOP" | "FLOP"): TableSnapshot =>
    snap({
      seats: [
        { label: "Hero", position: "BB", startingStack: 1000 },
        { label: "Player 3", position: "BTN", startingStack: 1000 },
      ],
      heroCards: ["Th", "3d"], // T3o — НЕ карманная пара
      board: ["3s", "3h", "Jd", "5h", "3c"], // борд доехал до каре троек
      actions: [
        { actor: "Player 3", action: "RAISE", amount: 60, street: "PREFLOP" },
        ...(foldStreet === "FLOP"
          ? [
              { actor: "Hero", action: "CALL", amount: 60, street: "PREFLOP" },
              { actor: "Hero", action: "FOLD", street: "FLOP" },
            ]
          : [{ actor: "Hero", action: "FOLD", street: "PREFLOP" }]),
      ] as TableAction[],
    });

  const heroLines = (s: TableSnapshot) =>
    renderHandFacts(s)
      .split("\n")
      .filter((l) => /Готовая рука Hero|Расклады против твоей руки|Ауты Hero|Дро Hero|Угрозы на/.test(l));

  it("фолд на префлопе → НИ ОДНОГО факта про руку на флопе/тёрне/ривере", () => {
    expect(heroLines(folded("PREFLOP"))).toHaveLength(0);
  });

  it("фолд на префлопе → нет «трипс/каре троек», из которых модель достраивала карманную пару", () => {
    const facts = renderHandFacts(folded("PREFLOP"));
    expect(facts).not.toContain("трипс троек");
    expect(facts).not.toContain("каре троек");
  });

  it("фолд на ФЛОПЕ → рука на флопе ЕСТЬ (решение принималось, видя его), а тёрна/ривера нет", () => {
    const lines = heroLines(folded("FLOP"));
    expect(lines.some((l) => l.includes("на флопе"))).toBe(true);
    expect(lines.some((l) => l.includes("на тёрне") || l.includes("на ривере"))).toBe(false);
  });

  it("Hero не фолдил → факты по всем улицам на месте (ничего не сломали)", () => {
    const s = snap({
      seats: [{ label: "Hero", position: "BB", startingStack: 1000 }],
      heroCards: ["Jh", "8c"],
      board: ["8s", "2d", "Jd", "5c", "3h"],
      actions: [{ actor: "Hero", action: "CALL", amount: 10, street: "PREFLOP" }],
    });
    const made = renderHandFacts(s).split("\n").filter((l) => l.includes("Готовая рука Hero"));
    expect(made).toHaveLength(3); // флоп + тёрн + ривер
  });
});

// Регресс #43 (2026-07-17): после своего олл-ина Hero из раздачи ВЫШЕЛ — решений больше нет.
// Тренер советовал «фолд, сохраняющий стек» игроку, чей стек уже целиком в банке.
describe("renderHandFacts — олл-ин Hero закрывает его решения", () => {
  const seats: Seat[] = [
    { label: "Hero", position: "BTN", startingStack: 2360 },
    { label: "opp1", position: "SB", startingStack: 2880 },
  ];

  it("Hero пошёл олл-ином — факт «решений больше нет» напечатан", () => {
    const r = renderHandFacts(
      snap({
        seats,
        heroCards: ["Ad", "Tc"],
        actions: [
          { street: "PREFLOP", actor: "opp1", action: "ALL_IN", amount: 540 } as TableAction,
          { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 2340 } as TableAction,
        ],
      }),
    );
    // ⚠️Регресс (Артём поймал): при покрытии коротышей стек НЕ теряется весь, излишек
    // возвращается — «весь стек в банке» противоречило геометрии. Теперь этой фразы быть НЕ должно.
    expect(r).not.toContain("весь твой стек уже в банке");
    expect(r).toContain("решений у тебя в ЭТОЙ раздаче больше нет");
    expect(r).toContain("не советуй сбросить или заколлировать после него");
  });

  // Регресс #121/#114/#89 (Артём, 17.07): для префлоп-олл-инов парсер эквити не считал → тренер
  // сочинял «хорошее эквити», хваля даже доминацию. Теперь точное эквити против ВСКРЫТЫХ рук.
  const eqLine = (r: string) => r.split("\n").find((l) => l.includes("ТОЧНОЕ ЭКВИТИ")) ?? "";

  it("префлоп-олл-ин: эквити против вскрытых рук — доминацию называет позади, не «хорошим»", () => {
    // AJs 4-бет-олл-ин против вскрытых AKs (SB) и A9o (UTG). AJs раздавлен AKs, но бьёт A9.
    const s = snap({
      seats: [
        { label: "opp1", position: "SB", positionName: "SB", startingStack: 17400, shownCards: ["Ah", "Kh"] },
        { label: "opp2", position: "EARLY", positionName: "UTG", startingStack: 71928, shownCards: ["9h", "Ad"] },
        { label: "Hero", position: "BB", positionName: "BB", startingStack: 31667 },
      ] as Seat[],
      heroCards: ["Jc", "Ac"],
      board: ["2c", "4d", "Kd", "3d", "3c"],
      actions: [
        { street: "PREFLOP", actor: "opp1", action: "POST_SB", amount: 1000 } as TableAction,
        { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 2000 } as TableAction,
        { street: "PREFLOP", actor: "opp2", action: "RAISE", amount: 4000 } as TableAction,
        { street: "PREFLOP", actor: "opp1", action: "RAISE", amount: 17000 } as TableAction,
        { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 30000 } as TableAction,
      ],
    });
    const line = eqLine(renderShowdownFacts(s));
    expect(line).toContain("AKs");
    expect(line).toMatch(/AKs\)\s*≈\d/); // конкретное число против AKs
    expect(line).toContain("ПОЗАДИ"); // раздавлен, а не «хорошее эквити»
    expect(line).toContain("A9o");
    expect(line).toContain("по результату");
  });

  it("Hero сбросил префлоп — эквити-строки нет (своей руки на вскрытии не было)", () => {
    const s = snap({
      seats: [
        { label: "opp1", position: "SB", positionName: "SB", startingStack: 17400, shownCards: ["Ah", "Kh"] },
        { label: "Hero", position: "BB", positionName: "BB", startingStack: 31667 },
      ] as Seat[],
      heroCards: ["Jc", "Ac"],
      board: ["2c", "4d", "Kd", "3d", "3c"],
      actions: [
        { street: "PREFLOP", actor: "opp1", action: "POST_SB", amount: 1000 } as TableAction,
        { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 2000 } as TableAction,
        { street: "PREFLOP", actor: "opp1", action: "ALL_IN", amount: 17000 } as TableAction,
        { street: "PREFLOP", actor: "Hero", action: "FOLD" } as TableAction,
      ],
    });
    expect(eqLine(renderShowdownFacts(s))).toBe("");
  });

  it("Hero НЕ шёл олл-ином — факта нет (не шумим лишней строкой)", () => {
    const r = renderHandFacts(
      snap({
        seats,
        heroCards: ["Ad", "Tc"],
        actions: [
          { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 200 } as TableAction,
          { street: "PREFLOP", actor: "opp1", action: "CALL", amount: 200 } as TableAction,
        ],
      }),
    );
    expect(r).not.toContain("весь твой стек уже в банке");
  });
});

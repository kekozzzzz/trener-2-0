import { describe, it, expect } from "vitest";
import { buildRangeReads, extractRangeNotation } from "@/infrastructure/queue/steps/range-facts";
import type { TableSnapshot } from "@/parser/types";
import type { OpponentFact } from "@/parser/opponent-profile";

// Сборка RangeRead из истории диалога — чистая логика без БД. Ответы сетки
// собраны по реальному шаблону словаря (messages/ru.json → rangeComposed).

// Hero A♥5♥ против одного оппонента; борд дошёл до тёрна K♥8♥2♣Q♦.
// Действия: [0..2] префлоп, [3] ставка оппонента на флопе, [4] ставка на тёрне.
const SNAPSHOT: TableSnapshot = {
  seats: [
    { label: "Hero", position: "BTN", startingStack: 1500, seatNumber: 1 },
    { label: "Player 3", position: "BB", startingStack: 1500, seatNumber: 3, opponentToken: "opp1" },
  ],
  heroCards: ["Ah", "5h"],
  board: ["Kh", "8h", "2c", "Qd"],
  actions: [
    { street: "PREFLOP", actor: "Player 3", action: "POST_BB", amount: 20 },
    { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 45 },
    { street: "PREFLOP", actor: "Player 3", action: "CALL", amount: 25 },
    { street: "FLOP", actor: "Player 3", action: "BET", amount: 60 },
    { street: "TURN", actor: "Player 3", action: "BET", amount: 120 },
  ],
  potTotal: 400,
};

const OPPONENT: OpponentFact = {
  seatLabel: "Player 3",
  type: "REG",
  confidence: "solid",
  vpip: 22,
  pfr: 18,
  handsObserved: 40,
};

// Ответ сетки, как его собирает range-answer-form (composeAnswer + шаблон словаря).
function gridAnswer(notation: string, note = ""): string {
  const base = `Думаю, у оппонента диапазон: ${notation} (42 комбо, 3.2% рук).`;
  return note ? `${base} ${note}` : base;
}

describe("extractRangeNotation — нотация из текста ответа сетки", () => {
  it("берёт кусок между двоеточием и скобкой, заметка не мешает", () => {
    expect(extractRangeNotation(gridAnswer("99+, AJs+", "он тайтовый вроде"))).toBe("99+, AJs+");
  });

  it("свободный текст без шаблона — null", () => {
    expect(extractRangeNotation("не знаю, наверное любые две")).toBeNull();
  });
});

describe("buildRangeReads — факты парсера по отмеченным диапазонам", () => {
  it("range-вопрос с меткой тёрна: эквити посчитано на борде тёрна", () => {
    const reads = buildRangeReads({
      history: [
        {
          roundNumber: 1,
          question: "{{range}} {{table:4}} Какие руки он так ставит?",
          answer: gridAnswer("KK"),
        },
      ],
      tableSnapshot: SNAPSHOT,
      opponents: [OPPONENT],
    });

    expect(reads).toHaveLength(1);
    const r = reads[0];
    expect(r.street).toBe("TURN");
    expect(r.notation).toBe("KK");
    // Ручной расчёт из range-equity.test.ts: флеш-дро против сета KK на этом тёрне.
    expect(r.equityPct).toBe(16);
    expect(r.combosLive).toBe(3);
    expect(r.fullGrid).toBe(false);
    // Сверка с профилем единственного злодея: KK ≈ 0.45% сетки → округляется до 0.
    expect(r.vpipContrast).toEqual({ seatLabel: "Player 3", vpip: 22, handsObserved: 40, gapPp: -22 });
    expect(r.cut).toBeNull();
  });

  it("префлоп-вопрос: эквити не считается, процент сетки и сверка есть", () => {
    const reads = buildRangeReads({
      history: [
        {
          roundNumber: 1,
          question: "{{range}} {{table:2}} С чем он коллирует твой рейз?",
          answer: gridAnswer("22+, A2s+, A2o+, K2s+, K2o+, Q2s+, Q2o+, J2s+, J2o+"),
        },
      ],
      tableSnapshot: SNAPSHOT,
      opponents: [OPPONENT],
    });

    expect(reads).toHaveLength(1);
    expect(reads[0].street).toBe("PREFLOP");
    expect(reads[0].equityPct).toBeNull();
    expect(reads[0].gridPct).toBeGreaterThan(50);
    expect(reads[0].vpipContrast?.gapPp).toBeGreaterThan(30);
  });

  it("нарезка между двумя ответами: фолд-процент и доложенные комбо", () => {
    const reads = buildRangeReads({
      history: [
        {
          roundNumber: 1,
          question: "{{range}} {{table:3}} Чем он ставит флоп?",
          answer: gridAnswer("AA, KK"),
        },
        { roundNumber: 2, question: "Почему ты так решил?", answer: "по темпу ставки" },
        {
          roundNumber: 3,
          question: "{{range}} {{table:4}} А что продолжает на тёрне?",
          answer: gridAnswer("KK, QQ"),
        },
      ],
      tableSnapshot: SNAPSHOT,
      opponents: [OPPONENT],
    });

    expect(reads).toHaveLength(2);
    const cut = reads[1].cut;
    expect(cut?.vsRound).toBe(1);
    // Мёртвые к тёрну: A♥, K♥, Q♦ → AA 3 комбо, KK 3 комбо (было 6 живых);
    // осталось KK=3, AA выбито → 50%. QQ (3 живых) — доложено.
    expect(cut?.foldPct).toBe(50);
    expect(cut?.addedCombos).toBe(3);
  });

  it("текстовые ответы и нераспознанная нотация фактов не дают", () => {
    const reads = buildRangeReads({
      history: [
        { roundNumber: 1, question: "Почему ты коллировал?", answer: "по оддсам" },
        { roundNumber: 2, question: "{{range}} Какой у него диапазон?", answer: "да любые две карты" },
      ],
      tableSnapshot: SNAPSHOT,
      opponents: [OPPONENT],
    });
    expect(reads).toHaveLength(0);
  });

  // Регресс 26.07 (раздача 179eec8d): игрок написал текстом вместо разметки сетки,
  // Hero открылся с HJ, CO 3-бетнул, Hero пошёл олл-ин. План
  // 2026-07-26-эталонный-3бет-диапазон.md — запасной факт вместо тишины.
  const THREEBET_SNAPSHOT: TableSnapshot = {
    board: ["5d", "7c", "Tc", "Ts", "Th"],
    heroCards: ["Kc", "Qd"],
    potTotal: 37418,
    seats: [
      { label: "Hero", position: "HJ", positionName: "HJ", startingStack: 17989 },
      { label: "Player 2", position: "CO", positionName: "CO", startingStack: 28668, shownCards: ["Ah", "Ad"], opponentToken: "opp1" },
      { label: "Player 3", position: "BTN", positionName: "BTN", startingStack: 10788 },
      { label: "Player 4", position: "SB", positionName: "SB", startingStack: 20930 },
      { label: "Player 5", position: "BB", positionName: "BB", startingStack: 9808 },
    ],
    actions: [
      { street: "PREFLOP", actor: "Player 4", action: "POST_SB", amount: 300 },
      { street: "PREFLOP", actor: "Player 5", action: "POST_BB", amount: 600 },
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 1200 },
      { street: "PREFLOP", actor: "Player 2", action: "RAISE", amount: 4215 },
      { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 4", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 5", action: "FOLD" },
      { street: "PREFLOP", actor: "Hero", action: "ALL_IN", amount: 17899 },
      { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 13684 },
    ],
  };

  it("игрок не отметил диапазон, но Hero открылся-получил 3-бет-пошёл олл-ин → запасной эталонный факт", () => {
    const reads = buildRangeReads({
      history: [
        {
          roundNumber: 1,
          question: "{{table:18}} {{range}} С каким диапазоном соперник на CO делает 3-бет?",
          answer: "Тут я, скорее всего, ошибся. Надо было в пас.",
        },
      ],
      tableSnapshot: THREEBET_SNAPSHOT,
      opponents: [],
    });

    expect(reads).toHaveLength(1);
    const r = reads[0];
    expect(r.estimated).toBe(true);
    expect(r.street).toBe("PREFLOP");
    // Эталонный CO-диапазон (без данных об оппоненте — база велью+блеф), не «против одной AA».
    expect(r.equityPct).toBeGreaterThan(35);
    expect(r.equityPct).toBeLessThan(55);
    expect(r.buckets).toBeNull();
    expect(r.vpipContrast).toBeNull();
  });

  it("тот же спот, но соперник — известный NIT (solid) → диапазон уже, эквити Hero ниже", () => {
    const nitOpponent: OpponentFact = {
      seatLabel: "Player 2",
      type: "NIT",
      confidence: "solid",
      vpip: 12,
      pfr: 9,
      handsObserved: 120,
    };
    const readsBase = buildRangeReads({
      history: [{ roundNumber: 1, question: "{{range}}", answer: "текст без сетки" }],
      tableSnapshot: THREEBET_SNAPSHOT,
      opponents: [],
    });
    const readsNit = buildRangeReads({
      history: [{ roundNumber: 1, question: "{{range}}", answer: "текст без сетки" }],
      tableSnapshot: THREEBET_SNAPSHOT,
      opponents: [nitOpponent],
    });
    expect(readsNit[0].equityPct!).toBeLessThan(readsBase[0].equityPct!);
  });

  it("Hero открылся-получил 3-бет, но НЕ пошёл олл-ином (колл) → запасного факта нет", () => {
    const called: TableSnapshot = {
      ...THREEBET_SNAPSHOT,
      actions: THREEBET_SNAPSHOT.actions.map((a) =>
        a.actor === "Hero" && a.action === "ALL_IN" ? { ...a, action: "CALL" as const } : a,
      ),
    };
    const reads = buildRangeReads({
      history: [{ roundNumber: 1, question: "{{range}}", answer: "текст без сетки" }],
      tableSnapshot: called,
      opponents: [],
    });
    expect(reads).toHaveLength(0);
  });

  it("два известных злодея — сверку с VPIP не делаем (чей диапазон — не знаем)", () => {
    const reads = buildRangeReads({
      history: [
        { roundNumber: 1, question: "{{range}} {{table:4}} Что он ставит?", answer: gridAnswer("KK") },
      ],
      tableSnapshot: SNAPSHOT,
      opponents: [OPPONENT, { ...OPPONENT, seatLabel: "Player 5" }],
    });
    expect(reads[0].vpipContrast).toBeNull();
  });
});

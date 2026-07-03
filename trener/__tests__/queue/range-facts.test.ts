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

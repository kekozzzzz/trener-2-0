/**
 * Блок «диапазоны игрока + точные числа парсера» в промптах диалога и вердикта
 * (renderRangeReads, диапазонный движок 2026-07-03).
 *
 * Гарантия: если request.rangeReads задан — блок с эквити/сверками попадает в промпт
 * и числа в нём ровно те, что посчитал парсер; если пуст/undefined — промпт прежний.
 */

import { describe, it, expect } from "vitest";
import type { TableSnapshot } from "@/parser/types";
import type { NextQuestionRequest, RangeRead, VerdictRequest } from "@/infrastructure/adapters/llm/types";
import { buildDialogueQuestionPrompt } from "@/config/prompts/dialogue-question";
import { buildVerdictPrompt } from "@/config/prompts/verdict";

const READ: RangeRead = {
  roundNumber: 2,
  notation: "99+, AJs+, KQo",
  gridPct: 6,
  fullGrid: false,
  street: "TURN",
  equityPct: 41,
  combosLive: 52,
  buckets: { total: 52, beats: 30, losesTo: 20, ties: 2, worsePays: 12, worseAir: 18 },
  vpipContrast: { seatLabel: "Player 3", vpip: 22, handsObserved: 40, gapPp: -16 },
  cut: { vsRound: 1, foldPct: 63, addedCombos: 12 },
};

const snapshot: TableSnapshot = {
  seats: [
    { label: "Hero", position: "BTN", startingStack: 4000 },
    { label: "Player 3", position: "BB", startingStack: 4000 },
  ],
  actions: [
    { street: "PREFLOP", actor: "Player 3", action: "POST_BB", amount: 100 },
    { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 },
  ],
  heroCards: ["Ac", "Kc"],
  board: ["Kh", "8h", "2c", "Qd"],
  potTotal: 350,
};

const tournament = { handsCount: 80, vpipPercent: 24, resultBuyins: -1, styleDiagnosis: "PASSIVE" as const };

const base: NextQuestionRequest & VerdictRequest = {
  locale: "ru",
  history: [{ roundNumber: 1, question: "почему заколлировал?", answer: "думал слабее" }],
  draftVerdict: "колл тонковат",
  chipResult: -1200,
  tableSnapshot: snapshot,
  tournament,
};

const CASES: { name: string; build: (reads: RangeRead[] | undefined) => string }[] = [
  { name: "диалог", build: (r) => buildDialogueQuestionPrompt({ ...base, rangeReads: r }) },
  { name: "вердикт", build: (r) => buildVerdictPrompt({ ...base, rangeReads: r }) },
];

describe.each(CASES)("блок диапазонов в промпте: $name", ({ build }) => {
  it("с отметками — блок с числами парсера присутствует целиком", () => {
    const prompt = build([READ]);
    expect(prompt).toContain("Диапазоны, которые игрок отметил на сетке 13×13");
    expect(prompt).toContain("Раунд 2 (тёрн): отмечено «99+, AJs+, KQo» — 6% всех стартовых рук");
    expect(prompt).toContain("Эквити руки Hero против этого диапазона на этой улице: 41% (52 живых комбо");
    expect(prompt).toContain("отмеченная ширина правдоподобна");
    expect(prompt).toContain("выбито 63% живых комбо");
    expect(prompt).toContain("ДОЛОЖИЛ 12 комбо");
  });

  it("вся сетка и разрыв с VPIP называются прямо", () => {
    const prompt = build([
      {
        ...READ,
        notation: "22+, A2s+, A2o+ …",
        gridPct: 100,
        fullGrid: true,
        equityPct: null,
        combosLive: null,
        vpipContrast: { seatLabel: "Player 3", vpip: 22, handsObserved: 40, gapPp: 78 },
        cut: null,
      },
    ]);
    expect(prompt).toContain("ВСЯ сетка");
    expect(prompt).toContain("отмечено на 78 п.п. шире, чем он реально играет");
    expect(prompt).not.toContain("Эквити руки Hero");
  });

  it("без отметок — промпт без блока", () => {
    expect(build(undefined)).not.toContain("Диапазоны, которые игрок отметил");
    expect(build([])).not.toContain("Диапазоны, которые игрок отметил");
  });
});

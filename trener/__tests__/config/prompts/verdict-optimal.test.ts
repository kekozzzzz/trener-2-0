/**
 * Строка-факт «что советовал разбор» в промпте вердикта (правка 2026-07-17).
 * Раньше вердикт не видел optimal вообще — правило «optimal и итог зовут одно действие» было
 * невыполнимым. Спорить с разбором вердикту не запрещено (диалог мог вскрыть новое), запрещено
 * противоречить МОЛЧА.
 */
import { describe, it, expect } from "vitest";
import { buildVerdictPrompt } from "@/config/prompts/verdict";
import type { VerdictRequest } from "@/infrastructure/adapters/llm/types";
import type { TableSnapshot } from "@/parser/types";

const snapshot: TableSnapshot = {
  seats: [{ label: "Hero", position: "BTN", startingStack: 1000 }],
  heroCards: ["Ah", "Kd"],
  board: ["2c", "7h", "Js"],
  actions: [],
  potTotal: 100,
};

function req(optimalAction?: string): VerdictRequest {
  return {
    locale: "ru",
    history: [{ roundNumber: 1, question: "Что ты хотел этой ставкой?", answer: "Выбить его." }],
    draftVerdict: "Черновик разбора.",
    optimalAction,
    chipResult: -500,
    tableSnapshot: snapshot,
    tournament: { handsCount: 80, vpipPercent: 24, styleDiagnosis: "LOOSE", resultBuyins: -1 },
  };
}

describe("вердикт видит советованное разбором действие", () => {
  it("действие есть → строка-факт с ним в промпте", () => {
    const p = buildVerdictPrompt(req("колл"));
    expect(p).toContain("назвал лучшей линией: колл");
    expect(p).toContain("не противоречь ему");
  });

  it("разрешено спорить, но вслух — не молча", () => {
    expect(buildVerdictPrompt(req("рейз"))).toContain("а не выдавай молча обратное");
  });

  it("действия нет (старая раздача или мусор от модели) → промпт без блока, как раньше", () => {
    const p = buildVerdictPrompt(req(undefined));
    expect(p).not.toContain("назвал лучшей линией");
    expect(p).toContain("Черновик разбора."); // остальной промпт цел
  });
});

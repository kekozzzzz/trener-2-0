/**
 * Чередование тем вопроса (правка 2026-07-17).
 * Аудит: 24 вопроса из 26 начинались «с каким диапазоном…» — анкета из одной графы, это и есть
 * жалоба «доёбывается». Причина: промпт упоминает диапазон десятки раз (покерная теория, её не
 * выкинуть), а модель не помнит, что уже спрашивала. Просьбой «спрашивай разное» не лечится —
 * говорим фактом: код считает отработанные темы по истории.
 */
import { describe, it, expect } from "vitest";
import { buildDialogueQuestionPrompt } from "@/config/prompts/dialogue-question";
import type { NextQuestionRequest } from "@/infrastructure/adapters/llm/types";

const req = (questions: string[]): NextQuestionRequest => ({
  locale: "ru",
  tournament: { handsCount: 100, vpipPercent: 25, resultBuyins: -1, styleDiagnosis: "LOOSE" },
  chipResult: -1000,
  draftVerdict: "черновик",
  history: questions.map((q, i) => ({ roundNumber: i + 1, question: q, answer: "ответ игрока" })),
  tableSnapshot: { seats: [], heroCards: ["Ah", "Kd"], board: ["2c", "7h", "Td"], actions: [], potTotal: 100 },
});

describe("темы, уже спрошенные в диалоге", () => {
  it("спросил про диапазон → тема помечена, следующий вопрос про другое", () => {
    const p = buildDialogueQuestionPrompt(req(["С каким диапазоном он сюда заходит?"]));
    expect(p).toContain("уже спрашивал");
    expect(p).toContain("РИД соперника");
  });

  it("спросил про замысел → помечен замысел", () => {
    const p = buildDialogueQuestionPrompt(req(["Что ты хотел получить этой ставкой?"]));
    expect(p).toContain("ЗАМЫСЕЛ");
  });

  it("спросил про стол → помечено", () => {
    const p = buildDialogueQuestionPrompt(req(["Ты его раньше за столом видел?"]));
    expect(p).toContain("ЗА СТОЛОМ");
  });

  it("две темы подряд — обе в списке", () => {
    const p = buildDialogueQuestionPrompt(req(["С каким диапазоном он заходит?", "А какой был план на тёрн?"]));
    expect(p).toContain("РИД соперника");
    expect(p).toContain("ЗАМЫСЕЛ");
  });

  it("первый вопрос (истории нет) — блока нет, лишних токенов не тратим", () => {
    const p = buildDialogueQuestionPrompt(req([]));
    expect(p).not.toContain("уже спрашивал");
  });
});

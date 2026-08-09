// Фаза 4 плана 2026-08-08: промпт собирается под конкретный вызов. Режем ТОЛЬКО заведомо
// неприменимое — правила про поле, которого в ответе нет, и теорию про улицы, которых не было.
// Тест стережёт границу: запреты и обязательные строки правила 1 обязаны остаться ВЕЗДЕ.
import { describe, it, expect } from "vitest";
import { coachFramework, buildHandAnalysisSystemPrompt, handSawPostflop } from "@/config/prompts/hand-analysis";
import { buildVerdictSystemPrompt } from "@/config/prompts/verdict";
import { buildDialogueQuestionSystemPrompt } from "@/config/prompts/dialogue-question";
import type { TableSnapshot } from "@/parser/types";

function snap(partial: Partial<TableSnapshot>): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions: [], potTotal: 0, ...partial };
}

describe("сборка фреймворка под вызов", () => {
  it("сентинелы разметки НИКОГДА не уезжают в промпт", () => {
    for (const text of [
      coachFramework("ru"),
      coachFramework("ru", { postflop: false, retelling: false }),
      buildHandAnalysisSystemPrompt("ru"),
      buildHandAnalysisSystemPrompt("ru", { postflop: false, socratic: false }),
      buildVerdictSystemPrompt("ru", { postflop: false }),
      buildDialogueQuestionSystemPrompt("ru", { postflop: false }),
    ]) {
      expect(text).not.toContain("⟦");
      expect(text).not.toContain("⟧");
    }
  });

  it("раздача без борда: постфлоп-теория не грузится", () => {
    const full = coachFramework("ru");
    const preflopOnly = coachFramework("ru", { postflop: false });
    expect(preflopOnly.length).toBeLessThan(full.length);
    // Куски, применимые только когда борд был.
    expect(full).toContain("Чья это доска");
    expect(preflopOnly).not.toContain("Чья это доска");
    expect(preflopOnly).not.toContain("Донк-бет");
    expect(preflopOnly).not.toContain("Блефкатч");
  });

  it("вопрос и вердикт не получают секцию пересказа раздачи", () => {
    const full = coachFramework("ru");
    const noRetelling = coachFramework("ru", { retelling: false });
    expect(full).toContain("Сначала - что произошло за столом");
    expect(noRetelling).not.toContain("Сначала - что произошло за столом");
    expect(buildVerdictSystemPrompt("ru")).not.toContain("Сначала - что произошло за столом");
    expect(buildDialogueQuestionSystemPrompt("ru")).not.toContain("Сначала - что произошло за столом");
  });

  it("некритический разбор не получает правил про сократовский вопрос", () => {
    expect(buildHandAnalysisSystemPrompt("ru")).toContain("## Сократовский вопрос");
    expect(buildHandAnalysisSystemPrompt("ru", { socratic: false })).not.toContain("## Сократовский вопрос");
  });

  it("ЗАПРЕТЫ и правило 1 остаются во ВСЕХ вариантах сборки — их резать нельзя", () => {
    for (const text of [
      coachFramework("ru", { postflop: false, retelling: false }),
      buildHandAnalysisSystemPrompt("ru", { postflop: false, socratic: false }),
      buildVerdictSystemPrompt("ru", { postflop: false }),
      buildDialogueQuestionSystemPrompt("ru", { postflop: false }),
    ]) {
      expect(text).toContain("Главные правила");
      expect(text).toMatch(/не вычисляй|Не вычисляй/);
      expect(text).toMatch(/не уверен/i);
    }
  });

  it("handSawPostflop решает по борду, а не по догадке", () => {
    expect(handSawPostflop(snap({ board: [] }))).toBe(false);
    expect(handSawPostflop(snap({ board: ["Ah", "Kd"] }))).toBe(false);
    expect(handSawPostflop(snap({ board: ["Ah", "Kd", "2c"] }))).toBe(true);
  });
});

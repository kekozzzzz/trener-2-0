// Фаза 4 плана 2026-08-08: промпт собирается под конкретный вызов. Режем ТОЛЬКО заведомо
// неприменимое — правила про поле, которого в ответе нет, и теорию про улицы, которых не было.
// Тест стережёт границу: запреты и обязательные строки правила 1 обязаны остаться ВЕЗДЕ.
import { describe, it, expect } from "vitest";
import { coachFramework, buildHandAnalysisSystemPrompt, handSawPostflop, spotScope } from "@/config/prompts/hand-analysis";
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

// ── Фаза 5: теория режется по признакам спота ───────────────────────────────────────────────
describe("сборка промпта по признакам спота", () => {
  const deepHU = snap({
    seats: [
      { label: "Player 2", position: "BB", positionName: "BB", startingStack: 10000 },
      { label: "Hero", position: "BTN", positionName: "BTN", startingStack: 10000 },
    ],
    heroCards: ["Ah", "Ks"],
    board: ["Qd", "7s", "2c"],
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 300 },
      { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 200 },
      { street: "FLOP", actor: "Player 2", action: "CHECK" },
      { street: "FLOP", actor: "Hero", action: "CHECK" },
    ],
  });

  it("глубокий стек один на один без олл-ина: лишняя теория не грузится", () => {
    const sc = spotScope(deepHU);
    expect(sc).toMatchObject({ postflop: true, heroInBB: false, multiway: false, allIn: false, shortStack: false });
    const text = coachFramework("ru", sc);
    expect(text).not.toContain("Короткий стек и пуш-фолд");
    expect(text).not.toContain("Защита большого блайнда");
    expect(text).not.toContain("Колл олл-ина");
    expect(text).not.toContain("Сколько соперников в банке");
    // Постфлоп был — эта теория обязана остаться.
    expect(text).toContain("Чья это доска");
  });

  it("короткий стек: пуш-фолд возвращается", () => {
    const short = snap({ ...deepHU, seats: deepHU.seats.map((s) => ({ ...s, startingStack: 1200 })) });
    expect(spotScope(short).shortStack).toBe(true);
    expect(coachFramework("ru", spotScope(short))).toContain("Короткий стек и пуш-фолд");
  });

  it("Hero на BB: его математика защиты возвращается", () => {
    const bb = snap({
      ...deepHU,
      seats: [
        { label: "Player 2", position: "BTN", positionName: "BTN", startingStack: 10000 },
        { label: "Hero", position: "BB", positionName: "BB", startingStack: 10000 },
      ],
    });
    expect(spotScope(bb).heroInBB).toBe(true);
    expect(coachFramework("ru", spotScope(bb))).toContain("Защита большого блайнда");
  });

  it("олл-ин в раздаче: теория про колл олл-ина возвращается", () => {
    const allin = snap({ ...deepHU, actions: [...deepHU.actions, { street: "FLOP", actor: "Hero", action: "ALL_IN", amount: 9700 }] });
    expect(spotScope(allin).allIn).toBe(true);
    expect(coachFramework("ru", spotScope(allin))).toContain("Колл олл-ина");
  });

  it("ЗАПРЕТЫ на месте при самой агрессивной резке", () => {
    const text = coachFramework("ru", {
      postflop: false, retelling: false, heroInBB: false, multiway: false, allIn: false, shortStack: false,
    });
    expect(text).toContain("Главные правила");
    expect(text).toMatch(/не вычисляй|Не вычисляй/);
    expect(text).toMatch(/не уверен/i);
    expect(text).not.toContain("⟦");
  });

  it("одно правило — одно место: блоки не дублируют друг друга", () => {
    // Каша переезжает из одного файла в пятнадцать, если один и тот же абзац попал в два блока.
    // Сравниваем полный текст с суммой: то, что вырезано, обязано исчезнуть ровно один раз.
    const full = coachFramework("ru");
    const bare = coachFramework("ru", {
      postflop: false, retelling: false, heroInBB: false, multiway: false, allIn: false, shortStack: false,
    });
    for (const marker of ["Чья это доска", "Короткий стек и пуш-фолд", "Защита большого блайнда", "Колл олл-ина"]) {
      expect(full.split(marker).length - 1).toBe(1);
      expect(bare).not.toContain(marker);
    }
  });
});

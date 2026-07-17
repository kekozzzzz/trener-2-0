/**
 * «Не знаю» новичка → тренер обязан УЧИТЬ, а не выкатывать вердикт (правка 2026-07-17).
 * Прогон с симулятором-новичком: 15 диалогов из 15 — игрок сказал «я же новичок, что такое
 * диапазон?», тренер СРАЗУ дал вердикт. Помощи ноль, все диалоги по 1 раунду → для новичка
 * продукт = методичка, хотя обещает обучение (вопрос Артёма).
 * Промпт про «дай опору» модель игнорировала, а «ответил → complete» понимала буквально.
 * Лечим фактом: код видит непонимание и говорит об этом прямо.
 */
import { describe, it, expect } from "vitest";
import { buildDialogueQuestionPrompt } from "@/config/prompts/dialogue-question";
import type { NextQuestionRequest } from "@/infrastructure/adapters/llm/types";

const req = (rounds: Array<[string, string]>): NextQuestionRequest => ({
  locale: "ru",
  tournament: { handsCount: 100, vpipPercent: 25, resultBuyins: -1, styleDiagnosis: "LOOSE" },
  chipResult: -1000,
  draftVerdict: "черновик",
  history: rounds.map(([q, a], i) => ({ roundNumber: i + 1, question: q, answer: a })),
  tableSnapshot: { seats: [], heroCards: ["Ah", "Kd"], board: ["2c", "7h", "Td"], actions: [], potTotal: 100 },
});

describe("игрок не понял → опора, а не вердикт", () => {
  it("«что такое диапазон?» → complete запрещён, требуется объяснить + дать варианты", () => {
    const p = buildDialogueQuestionPrompt(req([["С каким диапазоном он заходит?", "Я же новичок, что такое диапазон?"]]));
    expect(p).toContain("НЕ ПОНЯЛ вопрос");
    expect(p).toContain("Ставить complete: true нельзя");
    expect(p).toContain("2-3 варианта");
  });

  it("«не знаю» ловится", () => {
    const p = buildDialogueQuestionPrompt(req([["Что ты хотел этой ставкой?", "не знаю, просто сыграл"]]));
    expect(p).toContain("НЕ ПОНЯЛ вопрос");
  });

  it("ВТОРОЕ «не знаю» подряд → наоборот, пора завершать (не мучаем)", () => {
    const p = buildDialogueQuestionPrompt(
      req([
        ["С каким диапазоном он заходит?", "не знаю"],
        ["Он тут скорее с сильными руками или и с блефами?", "я же говорю, не знаю"],
      ]),
    );
    expect(p).toContain("ВТОРОЙ раз подряд");
    expect(p).toContain("complete: true");
  });

  it("осмысленный ответ → блока нет, работает обычное правило «один вопрос»", () => {
    const p = buildDialogueQuestionPrompt(
      req([["С каким диапазоном он заходит?", "Думаю, у него тут только сильные руки: JJ+, AK, изредка блеф с дро"]]),
    );
    expect(p).not.toContain("НЕ ПОНЯЛ вопрос");
  });
});

describe("forceHelp — код закрывает модели выход в вердикт", () => {
  const stuck = req([["С каким диапазоном он заходит?", "Я же новичок, что такое диапазон?"]]);

  it("обычный запрос: поле complete в схеме ЕСТЬ", () => {
    expect(buildDialogueQuestionPrompt(stuck)).toContain('"complete"');
  });

  it("переспрос (forceHelp): поля complete в схеме НЕТ — закрывать диалог нечем", () => {
    const p = buildDialogueQuestionPrompt({ ...stuck, forceHelp: true });
    expect(p).not.toContain('"complete"');
  });

  it("переспрос: явное «СТОП» + требование объяснить и дать варианты", () => {
    const p = buildDialogueQuestionPrompt({ ...stuck, forceHelp: true });
    expect(p).toContain("СТОП");
    expect(p).toContain("ЗАПРЕЩЕНО");
    expect(p).toContain("2-3 варианта");
  });

  it("переспрос показывает ОБРАЗЕЦ хорошей помощи (модель копирует образцы — проверено)", () => {
    const p = buildDialogueQuestionPrompt({ ...stuck, forceHelp: true });
    expect(p).toContain("Диапазон — это все руки");
    expect(p).toContain("чаще впереди или чаще позади");
  });
});

/**
 * Тесты страховки answerMode (config/dialogue.ts, правка 2026-07-04): если текст
 * вопроса буквально просит перечислить руки — метка {{range}} ставится независимо
 * от флага модели (она промахивалась в обе стороны).
 */

import { describe, it, expect } from "vitest";
import { applyRangeMarker, questionAsksForRange, RANGE_ANSWER_MARKER } from "@/config/dialogue";

describe("questionAsksForRange", () => {
  it("явная просьба назвать руки → сетка", () => {
    expect(questionAsksForRange("Какие руки, по-твоему, составляют его диапазон здесь?")).toBe(true);
    expect(questionAsksForRange("Что он открывает с ранней позиции?")).toBe(true);
    expect(questionAsksForRange("Какими руками он продолжает на этом борде?")).toBe(true);
  });

  it("вопрос-мысль без перечисления рук → не сетка", () => {
    expect(questionAsksForRange("Почему ты решил заколлировать олл-ин с восьмёрками?")).toBe(false);
    expect(questionAsksForRange("Чего ты хотел добиться этой ставкой?")).toBe(false);
  });
});

describe("applyRangeMarker — страховка поверх флага модели", () => {
  it("флаг text, но вопрос просит руки → метка всё равно ставится", () => {
    const q = "Какие руки составляют его диапазон пуша?";
    expect(applyRangeMarker(q, "text").startsWith(RANGE_ANSWER_MARKER)).toBe(true);
  });

  it("флаг range → метка ставится как раньше", () => {
    expect(applyRangeMarker("Что он тут открывает?", "range").startsWith(RANGE_ANSWER_MARKER)).toBe(true);
  });

  it("вопрос-мысль с флагом text → метки нет", () => {
    const q = "Почему ты пошёл в олл-ин?";
    expect(applyRangeMarker(q, "text")).toBe(q);
  });
});

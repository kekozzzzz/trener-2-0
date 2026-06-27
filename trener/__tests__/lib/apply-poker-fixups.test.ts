/**
 * Тесты словаря авто-правок распознанной покерной речи (config/poker-asr-fixups +
 * lib/apply-poker-fixups). Проверяют, что системные ошибки движка чинятся, а
 * нормальный текст не калечится.
 */

import { describe, it, expect } from "vitest";
import { applyPokerFixups } from "@/lib/apply-poker-fixups";

describe("applyPokerFixups", () => {
  it("чинит системные ошибки движка на покерных терминах", () => {
    expect(applyPokerFixups("я отправляю алын")).toBe("я отправляю олл-ин");
    expect(applyPokerFixups("по эцм фолд дорогой")).toBe("по ICM фолд дорогой");
    expect(applyPokerFixups("считаю подоцсы")).toBe("считаю пот-оддсы");
    expect(applyPokerFixups("ставит комбет")).toBe("ставит контбет");
    expect(applyPokerFixups("сижу на готовке")).toBe("сижу на катофф");
    expect(applyPokerFixups("сдам валет одномастные")).toBe("дама-валет одномастные");
  });

  it("регистронезависимо", () => {
    expect(applyPokerFixups("Я отправляю АЛЫН")).toBe("Я отправляю олл-ин");
  });

  it("не трогает нормальный текст", () => {
    const clean = "я открылся с баттона и пошёл в чек-рейз на флопе";
    expect(applyPokerFixups(clean)).toBe(clean);
  });

  it("чинит несколько ошибок в одной фразе", () => {
    expect(applyPokerFixups("считаю подоцсы и отправляю алын")).toBe(
      "считаю пот-оддсы и отправляю олл-ин",
    );
  });

  it("работает по границам слова — не портит части других слов", () => {
    // «готовить» содержит «готов», но не должно превратиться в катофф.
    expect(applyPokerFixups("надо готовить руку")).toBe("надо готовить руку");
  });
});

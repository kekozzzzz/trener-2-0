import { describe, it, expect } from "vitest";
import { boardDangerFacts } from "@/parser/facts";

// Фикс 2026-08-04: на живом продукте вердикт по борду 7♠T♠A♦3♥2♠ (3 пики) не упомянул флеш
// в чтении диапазона соперника - у boardDangerFacts не было ветки для монотон-борда, только
// для спаренного/трипс. Регресс-тест на ту самую раздачу + обратные случаи (Правило: новый
// факт проверяется и на случаях, где он НЕ должен сработать).

describe("boardDangerFacts — флеш-угроза", () => {
  it("3 карты одной масти, Hero не держит эту масть - предупреждает про флеш", () => {
    const facts = boardDangerFacts(["Qh", "9d"], ["7s", "Ts", "Ad", "3h", "2s"]);
    expect(facts.some((f) => f.includes("флеш"))).toBe(true);
  });

  it("Hero сам держит 2 карты этой масти (это его флеш, не угроза) - не предупреждает", () => {
    const facts = boardDangerFacts(["Ks", "5s"], ["7s", "Ts", "Ad", "3h", "2s"]);
    expect(facts.some((f) => f.includes("флеш"))).toBe(false);
  });

  it("радужный борд без трёх одной масти - не предупреждает про флеш", () => {
    const facts = boardDangerFacts(["Qh", "9d"], ["7s", "Th", "Ad", "3c", "2s"]);
    expect(facts.some((f) => f.includes("флеш"))).toBe(false);
  });

  it("спаренный борд без флеш-угрозы - предупреждает про фулл, не про флеш", () => {
    const facts = boardDangerFacts(["Qh", "9d"], ["7s", "7h", "Ad", "3c", "2s"]);
    expect(facts.some((f) => f.includes("спарена"))).toBe(true);
    expect(facts.some((f) => f.includes("флеш"))).toBe(false);
  });
});

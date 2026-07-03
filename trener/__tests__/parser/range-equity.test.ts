import { describe, it, expect } from "vitest";
import { combosForCode, equityVsRange, cutBetween } from "@/parser/range-equity";
import { parseRangeNotation, expandToken } from "@/config/poker/hand-range";
import { formatRange } from "@/config/poker/hand-grid";

// Эквити против отмеченного диапазона — точным перебором. Все ожидаемые числа
// в тестах посчитаны руками (малые случаи), не сняты с выдачи движка.

describe("combosForCode — разворачивание кода в конкретные комбо", () => {
  it("пара 6, одномастные 4, разномастные 12", () => {
    expect(combosForCode("AA")).toHaveLength(6);
    expect(combosForCode("AKs")).toHaveLength(4);
    expect(combosForCode("AKo")).toHaveLength(12);
  });

  it("кривой код — пусто", () => {
    expect(combosForCode("A")).toHaveLength(0);
    expect(combosForCode("AKx")).toHaveLength(0);
  });
});

describe("expandToken / parseRangeNotation — «−»-интервалы и злой ввод", () => {
  it("QQ-99 разворачивается в четыре пары", () => {
    expect(expandToken("QQ-99")).toEqual(["QQ", "JJ", "TT", "99"]);
  });

  it("A9s-A6s разворачивается по младшей карте", () => {
    expect(expandToken("A9s-A6s")).toEqual(["A9s", "A8s", "A7s", "A6s"]);
  });

  it("нотация сетки разбирается обратно в те же коды", () => {
    const codes = ["AA", "KK", "QQ", "JJ", "AKs", "AQs", "AJs", "A5s", "AKo", "KQo"];
    const parsed = parseRangeNotation(formatRange(codes));
    expect(new Set(parsed)).toEqual(new Set(codes));
  });

  it("злой ввод отбрасывается целиком", () => {
    expect(parseRangeNotation("ерунда")).toEqual([]);
    expect(parseRangeNotation("AA, ерунда")).toEqual([]);
    expect(parseRangeNotation("KAs")).toEqual([]); // младшая старше старшей
    expect(parseRangeNotation("99-QQ")).toEqual([]); // интервал вверх ногами
    expect(parseRangeNotation("")).toEqual([]);
  });
});

describe("equityVsRange — точное эквити против диапазона", () => {
  it("ривер, натс против сета: 100%", () => {
    // Роял-флеш Hero; QQ живёт тремя комбо (Q♥ на борде).
    const r = equityVsRange(["Ah", "Kh"], ["Qh", "Jh", "Th", "2c", "2d"], ["QQ"]);
    expect(r).toEqual({ equityPct: 100, combosLive: 3, combosMarked: 6 });
  });

  it("ривер, две пары против фулл-хауса: 0%", () => {
    // Hero A♠A♦ на K♠Q♥7♣2♦2♠ — тузы и двойки; KK собирает фулл.
    const r = equityVsRange(["As", "Ad"], ["Ks", "Qh", "7c", "2d", "2s"], ["KK"]);
    expect(r?.equityPct).toBe(0);
    expect(r?.combosLive).toBe(3); // K♠ мёртв
  });

  it("ривер, игра бордом против пары: делёж 50%", () => {
    // Стрит лежит на борде, ни Hero, ни 22 его не улучшают.
    const r = equityVsRange(["2c", "3c"], ["As", "Ks", "Qd", "Jd", "Tc"], ["22"]);
    expect(r?.equityPct).toBe(50);
    expect(r?.combosLive).toBe(3); // 2♣ мёртва
  });

  it("тёрн, флеш-дро против сета: 7 чистых ривер-аутов из 44 → 16%", () => {
    // A♥5♥ на K♥8♥2♣Q♦ против KK (3 комбо без червей): помогают 9 червей,
    // но 2♥ и Q♥ спаривают борд и дают KK фулл-хаус → 7/44 ≈ 16%.
    const r = equityVsRange(["Ah", "5h"], ["Kh", "8h", "2c", "Qd"], ["KK"]);
    expect(r?.equityPct).toBe(16);
    expect(r?.combosLive).toBe(3);
  });

  it("диапазон целиком перекрыт мёртвыми картами → null", () => {
    // Три туза мертвы — двух живых для пары AA не осталось.
    const r = equityVsRange(["As", "Ah"], ["Ad", "7c", "2d"], ["AA"]);
    expect(r).toBeNull();
  });

  it("префлоп и кривой вход → null", () => {
    expect(equityVsRange(["As", "Ah"], [], ["KK"])).toBeNull();
    expect(equityVsRange(["As"], ["Ad", "7c", "2d"], ["KK"])).toBeNull();
    expect(equityVsRange(["As", "Ah"], ["Ad", "7c", "2d"], [])).toBeNull();
    expect(equityVsRange(["As", "As"], ["Ad", "7c", "2d"], ["KK"])).toBeNull(); // дубль карты
  });

  it("расширение диапазона слабыми руками поднимает эквити Hero", () => {
    const tight = equityVsRange(["As", "Ad"], ["Ks", "Qh", "7c"], ["KK"]);
    const wide = equityVsRange(["As", "Ad"], ["Ks", "Qh", "7c"], ["KK", "22"]);
    expect(tight && wide && wide.equityPct > tight.equityPct).toBe(true);
  });
});

describe("cutBetween — нарезка диапазона между двумя ответами", () => {
  it("выбита половина комбо", () => {
    const cut = cutBetween(["AA", "KK"], ["AA"], []);
    expect(cut).toEqual({ foldPct: 50, prevCombos: 12, keptCombos: 6, addedCombos: 0 });
  });

  it("«доложенные» руки видны отдельно и не считаются продолжившими", () => {
    const cut = cutBetween(["AA", "KK"], ["AA", "QQ"], []);
    expect(cut?.keptCombos).toBe(6);
    expect(cut?.addedCombos).toBe(6);
    expect(cut?.foldPct).toBe(50);
  });

  it("мёртвые карты вычитаются из обоих диапазонов", () => {
    // A♠ известен → AA живёт 3 комбо; всё сохранено.
    const cut = cutBetween(["AA"], ["AA"], ["As"]);
    expect(cut).toEqual({ foldPct: 0, prevCombos: 3, keptCombos: 3, addedCombos: 0 });
  });

  it("пустой исходный диапазон → null", () => {
    expect(cutBetween([], ["AA"], [])).toBeNull();
  });
});

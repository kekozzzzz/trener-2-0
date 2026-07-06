import { describe, it, expect } from "vitest";
import { readHeroDraw, drawEquity, improvementOuts } from "@/parser/draws";

// Ауты Hero — точным перебором. Числа аутов проверяемы руками; эквити — производное
// (1 карта = ауты/нераскрытые), для 2 карт проверяем границы и clean ≤ raw.

describe("readHeroDraw — ауты, чистые/грязные, бэкдоры", () => {
  it("флеш-дро: 9 аутов, 1 грязный (туз пары борда), 8 чистых", () => {
    // A♥K♥ на 2♥7♥Q♠: 9 червовых аутов; Q♥ спаривает Q борда → грязный.
    const d = readHeroDraw(["Ah", "Kh"], ["2h", "7h", "Qs"]);
    expect(d?.kind).toBe("флеш-дро");
    expect(d?.outsRaw).toBe(9);
    expect(d?.outsClean).toBe(8);
    expect(d?.taintReason).toMatch(/спаривают борд/);
    expect(d?.backdoorOnly).toBe(false);
  });

  it("двустороннее стрит-дро: 8 аутов, все чистые на сухом борде", () => {
    const d = readHeroDraw(["8c", "9d"], ["7h", "Ts", "2c"]); // 7-8-9-T
    expect(d?.kind).toBe("двустороннее стрит-дро (ОЭСД)");
    expect(d?.outsRaw).toBe(8);
    expect(d?.outsClean).toBe(8);
    expect(d?.taintReason).toBeNull();
  });

  it("гатшот: 4 аута", () => {
    const d = readHeroDraw(["8c", "Td"], ["7h", "Js", "2c"]); // 7-8-_-T-J, нужна 9
    expect(d?.kind).toBe("гатшот");
    expect(d?.outsRaw).toBe(4);
    expect(d?.outsClean).toBe(4);
  });

  it("комбо флеш+стрит: 15 аутов объединением, 1 грязный (2♥ пара борда)", () => {
    const d = readHeroDraw(["8h", "9h"], ["7h", "Th", "2c"]); // флеш-дро h + ОЭСД 7-8-9-T
    expect(d?.kind).toContain("флеш-дро");
    expect(d?.kind).toContain("ОЭСД");
    expect(d?.outsRaw).toBe(15);
    expect(d?.outsClean).toBe(14); // 2♥ даёт флеш, но спаривает 2 борда
  });

  it("грязные стрит-ауты: масть достраивает соперникам флеш", () => {
    // 8c9d на 7h Th 2s: ОЭСД (6,J). 6♥/J♥ дают стрит, но это 3-я черва на борде → флеш врагу.
    const d = readHeroDraw(["8c", "9d"], ["7h", "Th", "2s"]);
    expect(d?.outsRaw).toBe(8);
    expect(d?.outsClean).toBe(6); // 6♥, J♥ грязные
    expect(d?.taintReason).toMatch(/достраивают возможный флеш/);
  });

  it("бэкдорное флеш-дро: одно-карточных аутов нет, помечается бэкдором", () => {
    const d = readHeroDraw(["Ah", "Kh"], ["Qh", "7c", "2d"]); // 3 червы (2 Hero)
    expect(d?.backdoorOnly).toBe(true);
    expect(d?.outsRaw).toBe(0);
    expect(d?.kind).toBe("бэкдорное флеш-дро");
  });

  it("готовый флеш — не дро", () => {
    expect(readHeroDraw(["Ah", "Kh"], ["2h", "7h", "Qh"])).toBeNull();
  });

  it("дро целиком на доске, без участия Hero — не дро Hero", () => {
    expect(readHeroDraw(["Ac", "Kd"], ["7h", "8s", "9c", "Td"])).toBeNull();
  });

  it("на ривере дро нет", () => {
    expect(readHeroDraw(["Ah", "Kh"], ["2h", "7h", "Qs", "3c", "9d"])).toBeNull();
  });

  it("нет дро (даже бэкдора) — null", () => {
    // K♣8♦ на 2♥7♠Q♦: нет 4- и 3-флеша, нет 3 к стриту → ни дро, ни бэкдора.
    expect(readHeroDraw(["Kc", "8d"], ["2h", "7s", "Qd"])).toBeNull();
  });
});

describe("drawEquity — точный перебор", () => {
  it("флеш-дро, 1 карта (тёрн впереди): сырое 19%, чистое 17%", () => {
    const eq = drawEquity(["Ah", "Kh"], ["2h", "7h", "Qs"], 1);
    expect(eq?.rawPct).toBe(19); // 9/47
    expect(eq?.cleanPct).toBe(17); // 8/47 (без Q♥)
  });

  it("флеш-дро, 2 карты (к риверу): сырое 36% (флеш + бэкдор-бродвей), чистое меньше", () => {
    // A♥K♥ к риверу: червы + бэкдорный стрит A-K-Q-J-T (раннер J,T) → 36% сырое.
    const eq = drawEquity(["Ah", "Kh"], ["2h", "7h", "Qs"], 2);
    expect(eq?.rawPct).toBe(36);
    expect(eq?.cleanPct).toBeLessThan(eq!.rawPct);
    expect(eq?.cleanPct).toBeGreaterThan(20);
  });

  it("гатшот, 1 карта: 4/47 ≈ 9%", () => {
    const eq = drawEquity(["8c", "Td"], ["7h", "Js", "2c"], 1);
    expect(eq?.rawPct).toBe(9);
    expect(eq?.cleanPct).toBe(9);
  });

  it("чистое никогда не больше сырого", () => {
    const eq = drawEquity(["8c", "9d"], ["7h", "Th", "2s"], 2);
    expect(eq!.cleanPct).toBeLessThanOrEqual(eq!.rawPct);
  });

  it("готовая рука → null", () => {
    expect(drawEquity(["Ah", "Kh"], ["2h", "7h", "Qh"], 1)).toBeNull();
  });
});

describe("improvementOuts — ЛЮБЫЕ ауты на улучшение (перебор)", () => {
  it("77 на монотоне 9♣K♣4♣: 11 всего, 0 чистых (2 сет + 9 спаривают борд, всё грязное)", () => {
    // Тот самый спот из разбора, где тренер выдумал «сет из 6 аутов». До сета ровно 2
    // (7♥,7♣), плюс 9 карт спаривают борд → слабые две пары. Борд монотонный → всё грязное.
    const io = improvementOuts(["7s", "7d"], ["9c", "Kc", "4c"]);
    expect(io?.outsRaw).toBe(11);
    expect(io?.outsClean).toBe(0);
    expect(io?.byTarget[0]).toEqual({ toCategory: "сета/трипса", count: 2, dirty: 2 });
    expect(io?.byTarget[1]).toEqual({ toCategory: "двух пар", count: 9, dirty: 9 });
    expect(io?.taintReasons.length).toBe(2); // и спаривание борда, и монотон
  });

  it("карманная пара до сета — ровно 2 аута; на сухом радужном борде они чистые", () => {
    const io = improvementOuts(["8s", "8d"], ["2h", "7c", "Ks"]);
    expect(io?.byTarget[0]).toEqual({ toCategory: "сета/трипса", count: 2, dirty: 0 });
    expect(io?.outsClean).toBe(2); // 2 сет-аута чистые; спаривания борда — грязные
    expect(io?.byTarget[1]).toEqual({ toCategory: "двух пар", count: 9, dirty: 9 });
    expect(io?.taintReasons.some((r) => /спаривают борд/.test(r))).toBe(true);
  });

  it("оверкарты A-Q на низком борде: 6 чистых аутов на пару (спаривание борда играет борд — не в счёт)", () => {
    const io = improvementOuts(["As", "Qd"], ["2c", "7h", "9s"]);
    expect(io?.outsRaw).toBe(6); // 3 туза + 3 дамы
    expect(io?.outsClean).toBe(6);
    expect(io?.byTarget).toEqual([{ toCategory: "пары", count: 6, dirty: 0 }]);
    expect(io?.taintReasons.length).toBe(0);
  });

  it("на ривере аутов нет (карт больше не будет) → null", () => {
    expect(improvementOuts(["7s", "7d"], ["9c", "Kc", "4c", "2d", "Jh"])).toBeNull();
  });

  it("инварианты: чистых ≤ всего, сумма разбивки = всего", () => {
    const io = improvementOuts(["8s", "8d"], ["2h", "7c", "Ks"]);
    expect(io!.outsClean).toBeLessThanOrEqual(io!.outsRaw);
    expect(io!.byTarget.reduce((s, t) => s + t.count, 0)).toBe(io!.outsRaw);
  });
});

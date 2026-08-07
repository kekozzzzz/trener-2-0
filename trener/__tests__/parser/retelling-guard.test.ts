import { describe, it, expect } from "vitest";
import { misreportedFold, misstatedBetSize } from "@/parser/retelling-guard";
import type { TableSnapshot } from "@/parser/types";

function snap(partial: Partial<TableSnapshot>): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions: [], potTotal: 0, ...partial };
}

// Раздача-регресс 07.08: 66 на BTN, флоп T♥K♣5♥. BB поставил, HJ сбросил, CO ЗАКОЛЛИРОВАЛ,
// Hero сбросил. На ривере CO уже сбросил на олл-ин BB — то есть фолд у него в раздаче ЕСТЬ,
// и сторож обязан судить по УЛИЦЕ, а не по раздаче целиком.
// Числа подобраны так, чтобы бет на флопе был ровно четвертью банка (250 в банк 1000), а ривер —
// овербетом: на этих двух размерах проверяется сторож долей банка.
const REGRESSION = snap({
  seats: [
    { label: "Player 5", position: "BB", positionName: "BB", startingStack: 5400 },
    { label: "Player 7", position: "EARLY", positionName: "UTG+1", startingStack: 9700 },
    { label: "Player 1", position: "HJ", positionName: "HJ", startingStack: 4900 },
    { label: "Player 2", position: "CO", positionName: "CO", startingStack: 4500 },
    { label: "Hero", position: "BTN", positionName: "BTN", startingStack: 5800 },
  ],
  heroCards: ["6h", "6d"],
  board: ["Th", "Kc", "5h", "2d", "9s"],
  actions: [
    { street: "PREFLOP", actor: "Player 5", action: "POST_BB", amount: 100 },
    { street: "PREFLOP", actor: "Player 7", action: "RAISE", amount: 200 },
    { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 200 },
    { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 200 },
    { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 200 },
    { street: "PREFLOP", actor: "Player 5", action: "CALL", amount: 100 },
    { street: "FLOP", actor: "Player 5", action: "BET", amount: 250 },
    { street: "FLOP", actor: "Player 7", action: "FOLD" },
    { street: "FLOP", actor: "Player 1", action: "FOLD" },
    { street: "FLOP", actor: "Player 2", action: "CALL", amount: 250 },
    { street: "FLOP", actor: "Hero", action: "FOLD" },
    { street: "TURN", actor: "Player 5", action: "CHECK" },
    { street: "TURN", actor: "Player 2", action: "CHECK" },
    { street: "RIVER", actor: "Player 5", action: "ALL_IN", amount: 5350 },
    { street: "RIVER", actor: "Player 2", action: "FOLD" },
  ],
});

describe("misreportedFold — сторож перевранного пересказа", () => {
  it("ловит выдуманный фолд: CO заколлировал бет на флопе, а пересказ пишет «сбросил»", () => {
    const played =
      "На префлопе игрок на UTG+1 открылся рейзом до 2 BB. Ты на BTN заколлировал 2 BB, также коллы " +
      "сделали HJ и CO, а BB доставил 1 BB. На флопе в банке 10 BB BB поставил 2.5 BB. " +
      "UTG+1, HJ и CO сбросили, ты также сбросил свои 66.";
    expect(misreportedFold(played, REGRESSION)).toBe("CO");
  });

  it("честный пересказ той же раздачи брака не даёт", () => {
    const played =
      "На префлопе игрок на UTG+1 открылся рейзом до 2 BB. Ты на BTN заколлировал 2 BB, также коллы " +
      "сделали HJ и CO, а BB доставил 1 BB. На флопе в банке 10 BB BB поставил 2.5 BB. " +
      "UTG+1 и HJ сбросили, CO заколлировал, а ты сбросил свои 66.";
    expect(misreportedFold(played, REGRESSION)).toBeNull();
  });

  // Обратный случай: фолд у CO в раздаче ЕСТЬ, но на ривере. Судим по улице — на ривере правда.
  it("фолд на ривере назван верно — не брак, хотя на флопе CO коллировал", () => {
    const played = "На флопе BB поставил 2.5 BB, CO заколлировал. На ривере BB пошёл олл-ин, CO сбросил.";
    expect(misreportedFold(played, REGRESSION)).toBeNull();
  });

  it("сослагательное «если бы CO сбросил» — не утверждение факта", () => {
    const played = "На флопе BB поставил 2.5 BB. Если бы CO сбросил, ты остался бы один на один с BB.";
    expect(misreportedFold(played, REGRESSION)).toBeNull();
  });

  it("другая улица в самой фразе — фолд не приписываем заголовку", () => {
    const played = "На флопе ты сбросил свои 66, а CO сбросил только на ривере.";
    expect(misreportedFold(played, REGRESSION)).toBeNull();
  });

  it("«на тёрне и ривере» — заголовок про две улицы, не судим", () => {
    const played = "На тёрне и ривере BB чекал, CO сбросил.";
    expect(misreportedFold(played, REGRESSION)).toBeNull();
  });

  it("глагол не примыкает к позиции: «BB поставил 2.5 BB, а CO сбросил» винит только CO", () => {
    // BB на флопе ставил и не сбрасывал — если бы фолд приписался ему, это был бы ложный брак.
    const played = "На тёрне BB чекал, CO чекал.";
    expect(misreportedFold(played, REGRESSION)).toBeNull();
  });

  it("улица не названа вовсе — сторож молчит", () => {
    expect(misreportedFold("CO сбросил, ты тоже сбросил свои шестёрки.", REGRESSION)).toBeNull();
  });

  it("место сбросило раньше и на этой улице не действовало — молчим", () => {
    // UTG+1 сбросил на флопе; на тёрне его нет вовсе — пересказ про его фолд не бракуем.
    const played = "На тёрне UTG+1 сбросил, а BB чекал.";
    expect(misreportedFold(played, REGRESSION)).toBeNull();
  });

  it("«2.5 BB» — единица измерения, а не позиция: фолд туда не приписывается", () => {
    // Пересказ верный, но рядом с числом стоит «BB». Ложного брака быть не должно.
    const played = "На флопе BB поставил 2.5 BB, UTG+1 и HJ сбросили.";
    expect(misreportedFold(played, REGRESSION)).toBeNull();
  });
});

// В раздаче-регрессе бет BB на флопе = 590 в банк 2340, то есть ≈25% — «четверть банка».
// Вердикт написал «получишь ставку в полбанка»: правило унесено с чужим размером.
describe("misstatedBetSize — сторож выдуманного размера ставки", () => {
  it("ловит «полбанка» там, где ставка была в четверть банка", () => {
    const verdict =
      "Сброс на флопе был излишне осторожным. В следующий раз, когда получишь ставку в полбанка, " +
      "помни, что при SPR около 2 и позиции колл это стандарт.";
    expect(misstatedBetSize(verdict, REGRESSION)).toBe("полбанка");
  });

  it("верно названная четверть банка брака не даёт", () => {
    const verdict = "Ты получил ставку в четверть банка и сбросил третью пару - это нормальная линия.";
    expect(misstatedBetSize(verdict, REGRESSION)).toBeNull();
  });

  it("совет на будущее с любым размером законен: «в следующий раз ставь полбанка»", () => {
    const verdict = "На такой доске в следующий раз ставь полбанка, чтобы забрать банк сразу.";
    expect(misstatedBetSize(verdict, REGRESSION)).toBeNull();
  });

  it("«стоило поставить две трети банка» — разбор несыгранной линии, не факт раздачи", () => {
    const verdict = "Здесь стоило поставить две трети банка, и тогда его дро платило бы неправильную цену.";
    expect(misstatedBetSize(verdict, REGRESSION)).toBeNull();
  });

  it("размер вообще не назван — сторож молчит", () => {
    expect(misstatedBetSize("Ты сбросил третью пару против бета и колла - это нормально.", REGRESSION)).toBeNull();
  });

  it("постфлоп-ставок в раздаче нет — сравнивать не с чем, молчим", () => {
    const preflopOnly = snap({
      seats: REGRESSION.seats,
      heroCards: ["6h", "6d"],
      board: [],
      actions: [
        { street: "PREFLOP", actor: "Player 5", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 200 },
        { street: "PREFLOP", actor: "Hero", action: "FOLD" },
      ],
    });
    expect(misstatedBetSize("Ты получил ставку в полбанка и сбросил.", preflopOnly)).toBeNull();
  });

  it("«две трети банка» не путается с «трети банка»", () => {
    // Реальная ставка 25%: «треть банка» (полоса 20-47) прошла бы, а «две трети» (52-88) - нет.
    expect(misstatedBetSize("Его ставка была в треть банка.", REGRESSION)).toBeNull();
    expect(misstatedBetSize("Его ставка была в две трети банка.", REGRESSION)).toBe("две трети банка");
  });
});

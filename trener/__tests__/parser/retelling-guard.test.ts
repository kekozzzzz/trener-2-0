import { describe, it, expect } from "vitest";
import { misreportedFold, misstatedBetSize, disputesFoldWithoutPrice, heroFoldedFacingBet } from "@/parser/retelling-guard";
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

// В раздаче-регрессе бет BB на флопе = 250 в банк 1000, то есть 25% — «четверть банка».
// Сторож висит ТОЛЬКО на пересказе (`played`): там доля банка обязана совпадать с раздачей.
describe("misstatedBetSize — сторож выдуманного размера ставки", () => {
  it("ловит «полбанка» в пересказе там, где ставка была в четверть банка", () => {
    const played = "На флопе BB поставил полбанка, UTG+1 и HJ сбросили, CO заколлировал.";
    expect(misstatedBetSize(played, REGRESSION)).toBe("полбанка");
  });

  it("верно названная четверть банка брака не даёт", () => {
    const played = "На флопе ты получил ставку в четверть банка и сбросил свои шестёрки.";
    expect(misstatedBetSize(played, REGRESSION)).toBeNull();
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

// Эталонный прогон 08.08 вскрыл: первая версия сторожа размера бракова́ла ЗАКОННУЮ речь тренера
// про альтернативные сайзинги — 9 ложных браков на 30 раздач. Эти тексты обязаны проходить.
describe("misstatedBetSize — обратные случаи с эталонного прогона", () => {
  const legit = [
    "На сухом флопе контбет в 1/3 банка часто забирает банк сразу, так как у соперника много воздуха.",
    "На тёрне ставка должна быть более сбалансированной - около половины банка.",
    "Обычно на таком борде ставка в треть банка работает лучше.",
    "Лучше было бы поставить две трети банка, чтобы забрать инициативу.",
    "Стандартный контбет в полбанка тут выглядит нормально.",
    "Если бы ты поставил четверть банка, он бы заколлировал с чем угодно.",
  ];
  for (const text of legit) {
    it(`не бракует: «${text.slice(0, 45)}…»`, () => {
      expect(misstatedBetSize(text, REGRESSION)).toBeNull();
    });
  }

  it("но настоящий пересказ факта по-прежнему ловит", () => {
    expect(misstatedBetSize("На флопе BB поставил полбанка, и ты сбросил.", REGRESSION)).toBe("полбанка");
    expect(misstatedBetSize("Его ставка была в две трети банка.", REGRESSION)).toBe("две трети банка");
  });
});

// Регресс 09.08 (раздачи эталона 2/3/4): TT на K♦7♠2♣, овербет 25 BB в банк 6 BB, Hero сбросил.
// Колл требует ≈45% эквити. На тёрне и ривере тренер звал фолд верным, а на флопе — «подарком
// сопернику» и советовал коллировать, ни разу не назвав цену. Совет стоит игроку четверти стека.
const FOLD_VS_OVERBET = snap({
  seats: [
    { label: "Player 2", position: "BB", positionName: "BB", startingStack: 5000 },
    { label: "Hero", position: "BTN", positionName: "BTN", startingStack: 5000 },
  ],
  heroCards: ["Tc", "Td"],
  board: ["Kd", "7s", "2c"],
  actions: [
    { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 },
    { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 300 },
    { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 200 },
    { street: "FLOP", actor: "Player 2", action: "BET", amount: 2500 },
    { street: "FLOP", actor: "Hero", action: "FOLD" },
  ],
});

describe("disputesFoldWithoutPrice — спорить с фолдом только с ценой в руках", () => {
  it("ловит «фолд - это подарок сопернику» без названного порога", () => {
    const v = "Здесь не соглашусь: фолд на такой доске - это подарок сопернику. Твоя пара десяток бьёт весь его воздух.";
    expect(disputesFoldWithoutPrice(v, FOLD_VS_OVERBET)).toBeGreaterThan(0);
  });

  it("ловит «колл здесь выглядит оправданным»", () => {
    expect(disputesFoldWithoutPrice("Колл здесь выглядит оправданным.", FOLD_VS_OVERBET)).toBeGreaterThan(0);
  });

  it("ловит «фолд выглядит поспешным»", () => {
    expect(disputesFoldWithoutPrice("Твой фолд выглядит поспешным.", FOLD_VS_OVERBET)).toBeGreaterThan(0);
  });

  it("НЕ бракует, если цена названа — это и есть разрешённый спор", () => {
    const v = "Колл тут был бы оправдан, но только против игрока, который так блефует: цена требует 45% эквити.";
    expect(disputesFoldWithoutPrice(v, FOLD_VS_OVERBET)).toBeNull();
  });

  it("НЕ бракует согласие с фолдом", () => {
    const v = "Фолд здесь верное решение: против овербета твоя пара десяток превращается в блеф-кэтчер.";
    expect(disputesFoldWithoutPrice(v, FOLD_VS_OVERBET)).toBeNull();
  });

  it("НЕ бракует отрицание: «колл здесь не оправдан»", () => {
    expect(disputesFoldWithoutPrice("Колл здесь не оправдан, слишком дорого.", FOLD_VS_OVERBET)).toBeNull();
  });

  it("НЕ бракует, когда игрок вовсе не сбрасывал", () => {
    const called = snap({
      ...FOLD_VS_OVERBET,
      actions: FOLD_VS_OVERBET.actions.map((a) =>
        a.actor === "Hero" && a.action === "FOLD" ? { ...a, action: "CALL" as const, amount: 2500 } : a,
      ),
    });
    expect(disputesFoldWithoutPrice("Твой фолд выглядит поспешным.", called)).toBeNull();
  });

  it("порог берётся из парсера и близок к арифметике пот-оддсов", () => {
    const spot = heroFoldedFacingBet(FOLD_VS_OVERBET);
    expect(spot).not.toBeNull();
    // Доложить 2500 в банк, который станет 600+2500+2500 = 5600 → ≈45%.
    expect(spot!.equityPct).toBeGreaterThanOrEqual(43);
    expect(spot!.equityPct).toBeLessThanOrEqual(47);
  });

  // Карантин 26.09 (задача 8517cb7e): порог назван в соседнем поле разбора, спорная фраза — в
  // этом. Игрок читает разбор одним текстом, так что цена названа; брак был ложным и стоил
  // игроку всей раздачи (три попытки подряд).
  it("НЕ бракует, когда цена названа в соседнем поле того же разбора", () => {
    const optimal = "Твой фолд выглядит дисциплинированным, но колл мог быть оправдан против блефующего соперника.";
    const draftVerdict = "Порог окупаемости колла составляет ≈45%.";
    expect(disputesFoldWithoutPrice(optimal, FOLD_VS_OVERBET)).toBeGreaterThan(0);
    expect(disputesFoldWithoutPrice(optimal, FOLD_VS_OVERBET, draftVerdict)).toBeNull();
  });

  it("бракует, если цены нет НИ в одном поле разбора", () => {
    const optimal = "Твой фолд выглядит поспешным.";
    const draftVerdict = "Стоит подумать, как часто он блефует такой ставкой.";
    expect(disputesFoldWithoutPrice(optimal, FOLD_VS_OVERBET, draftVerdict)).toBeGreaterThan(0);
  });
});

// Щель, найденная прогоном 09.08: вердикт уже называл цену, а разбор всё ещё звал платить
// мягкой формой — «можно рассмотреть колл». Формулировка другая, вред тот же.
describe("disputesFoldWithoutPrice — мягкие формы того же совета", () => {
  it("ловит «можно рассмотреть колл»", () => {
    const t = "Твой фолд выглядит дисциплинированным, но можно рассмотреть колл: соперник часто блефует.";
    expect(disputesFoldWithoutPrice(t, FOLD_VS_OVERBET)).toBeGreaterThan(0);
  });

  it("ловит «колл позволяет реализовать эквити»", () => {
    expect(disputesFoldWithoutPrice("Колл позволяет реализовать эквити твоей пары.", FOLD_VS_OVERBET)).toBeGreaterThan(0);
  });

  it("но с названной ценой обе формы законны", () => {
    const t = "Можно рассмотреть колл, но он требует 45% эквити - против его овербета столько не набирается.";
    expect(disputesFoldWithoutPrice(t, FOLD_VS_OVERBET)).toBeNull();
  });

  it("и «колл не позволяет ничего реализовать» — не спор", () => {
    expect(disputesFoldWithoutPrice("Колл не позволяет тут ничего реализовать.", FOLD_VS_OVERBET)).toBeNull();
  });
});

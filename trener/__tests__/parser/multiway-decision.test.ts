import { describe, it, expect } from "vitest";
import { renderHandFacts } from "@/parser/facts";
import type { TableSnapshot } from "@/parser/types";

function snap(partial: Partial<TableSnapshot>): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions: [], potTotal: 0, ...partial };
}

const SEATS = [
  { label: "Player 5", position: "BB" as const, positionName: "BB", startingStack: 5400 },
  { label: "Player 1", position: "HJ" as const, positionName: "HJ", startingStack: 4900 },
  { label: "Player 2", position: "CO" as const, positionName: "CO", startingStack: 4500 },
  { label: "Hero", position: "BTN" as const, positionName: "BTN", startingStack: 5800 },
];

const PREFLOP = [
  { street: "PREFLOP" as const, actor: "Player 5", action: "POST_BB" as const, amount: 100 },
  { street: "PREFLOP" as const, actor: "Player 1", action: "RAISE" as const, amount: 200 },
  { street: "PREFLOP" as const, actor: "Player 2", action: "CALL" as const, amount: 200 },
  { street: "PREFLOP" as const, actor: "Hero", action: "CALL" as const, amount: 200 },
  { street: "PREFLOP" as const, actor: "Player 5", action: "CALL" as const, amount: 100 },
];

// Регресс 07.08: 66 на BTN, флоп T♥K♣5♥. BB поставил, CO ЗАКОЛЛИРОВАЛ, и только потом ход Hero.
// Вердикт рассуждал «против широкого диапазона BB» — как в хедз-апе — и назвал верный фолд
// «излишне осторожным». В точке решения должен стоять факт: соперников двое.
describe("факт мультивея в точке решения Hero", () => {
  it("бет + колл до хода Hero: считает ДВОИХ и запрещает «диапазон соперника» в единственном числе", () => {
    const s = snap({
      seats: SEATS,
      heroCards: ["6h", "6d"],
      board: ["Th", "Kc", "5h"],
      actions: [
        ...PREFLOP,
        { street: "FLOP", actor: "Player 5", action: "BET", amount: 590 },
        { street: "FLOP", actor: "Player 2", action: "CALL", amount: 590 },
        { street: "FLOP", actor: "Hero", action: "FOLD" },
      ],
    });
    const line = renderHandFacts(s)
      .split("\n")
      .find((l) => l.startsWith("Решение Hero на FLOP"));
    expect(line).toBeDefined();
    expect(line).toContain("Решение МУЛЬТИВЕЙ: в банке уже 2 соперника");
    expect(line).toContain("обойти ВСЕ 2 диапазона");
    // Хвост про готовую руку переключился во множественное число.
    expect(line).toContain("против диапазонов всех, кто уже в банке");
    expect(line).not.toContain("против диапазона соперника");
    // 66 под K и T — слабая пара, а не «пара+, которой хватает эквити».
    expect(line).toContain("пара у Hero СЛАБАЯ");
    expect(line).toContain("фолд здесь нормальная линия");
  });

  it("тот же спот один на один: мультивей-факта нет, формулировка в единственном числе", () => {
    const s = snap({
      seats: SEATS,
      heroCards: ["6h", "6d"],
      board: ["Th", "Kc", "5h"],
      actions: [
        ...PREFLOP,
        { street: "FLOP", actor: "Player 5", action: "BET", amount: 590 },
        { street: "FLOP", actor: "Player 2", action: "FOLD" },
        { street: "FLOP", actor: "Hero", action: "FOLD" },
      ],
    });
    const line = renderHandFacts(s)
      .split("\n")
      .find((l) => l.startsWith("Решение Hero на FLOP"));
    expect(line).toBeDefined();
    expect(line).not.toContain("МУЛЬТИВЕЙ");
    expect(line).toContain("против диапазона соперника");
    // Слабую пару называем слабой и в хедз-апе, но без вывода про фолд: там спот другой.
    expect(line).toContain("пара у Hero СЛАБАЯ");
    expect(line).not.toContain("фолд здесь нормальная линия");
  });

  it("топ-пара не помечается слабой", () => {
    const s = snap({
      seats: SEATS,
      heroCards: ["Kh", "Qd"],
      board: ["Th", "Kc", "5h"],
      actions: [
        ...PREFLOP,
        { street: "FLOP", actor: "Player 5", action: "BET", amount: 590 },
        { street: "FLOP", actor: "Player 2", action: "CALL", amount: 590 },
        { street: "FLOP", actor: "Hero", action: "FOLD" },
      ],
    });
    const line = renderHandFacts(s)
      .split("\n")
      .find((l) => l.startsWith("Решение Hero на FLOP"));
    expect(line).toContain("Решение МУЛЬТИВЕЙ: в банке уже 2 соперника");
    expect(line).not.toContain("пара у Hero СЛАБАЯ");
  });

  it("блайнды за мультивей не считаются: префлоп-опен против одного рейзера", () => {
    const s = snap({
      seats: SEATS,
      heroCards: ["6h", "6d"],
      board: [],
      actions: [
        { street: "PREFLOP", actor: "Player 5", action: "POST_BB", amount: 100 },
        { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 200 },
        { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "FOLD" },
      ],
    });
    const line = renderHandFacts(s)
      .split("\n")
      .find((l) => l.startsWith("Решение Hero на PREFLOP"));
    expect(line).toBeDefined();
    expect(line).not.toContain("МУЛЬТИВЕЙ");
  });
});

// Та же дыра с другой стороны: порог фолд-эквити («сбросится ≥X% диапазона») посчитан для ОДНОГО
// соперника, а Hero ставит в двоих — сбросить обязаны оба.
describe("факт мультивея в ставке Hero", () => {
  it("бет Hero в двоих: порог называет каждого и предупреждает, что сбросить должны все", () => {
    const s = snap({
      seats: SEATS,
      heroCards: ["9c", "8c"],
      board: ["Th", "Kc", "5h"],
      actions: [
        ...PREFLOP,
        { street: "FLOP", actor: "Player 5", action: "CHECK" },
        { street: "FLOP", actor: "Player 1", action: "CHECK" },
        { street: "FLOP", actor: "Player 2", action: "CHECK" },
        { street: "FLOP", actor: "Hero", action: "BET", amount: 500 },
      ],
    });
    const line = renderHandFacts(s)
      .split("\n")
      .find((l) => l.startsWith("Ставка Hero (FLOP)"));
    expect(line).toBeDefined();
    expect(line).toContain("диапазона КАЖДОГО из 3 соперников");
    expect(line).toContain("сбросить должны ВСЕ до одного");
    expect(line).not.toContain("% диапазона соперника");
  });

  it("бет Hero один на один: формулировка прежняя, предупреждения нет", () => {
    const s = snap({
      seats: SEATS,
      heroCards: ["9c", "8c"],
      board: ["Th", "Kc", "5h"],
      actions: [
        ...PREFLOP,
        { street: "FLOP", actor: "Player 5", action: "CHECK" },
        { street: "FLOP", actor: "Player 1", action: "FOLD" },
        { street: "FLOP", actor: "Player 2", action: "FOLD" },
        { street: "FLOP", actor: "Hero", action: "BET", amount: 500 },
      ],
    });
    const line = renderHandFacts(s)
      .split("\n")
      .find((l) => l.startsWith("Ставка Hero (FLOP)"));
    expect(line).toContain("% диапазона соперника");
    expect(line).not.toContain("сбросить должны ВСЕ");
  });
});

// Аудит 07.08: факты про улицы ПОСЛЕ фолда Hero — призрак. Он их не играл, а модель прикладывает
// их к решению, которого не было («у тебя собран флеш» сброшенной руке).
describe("улицы после фолда Hero не печатаются", () => {
  const folded = snap({
    seats: SEATS,
    heroCards: ["Ah", "9h"],
    // Hero сбросил на флопе; третья черва и пара приходят только на тёрне и ривере.
    board: ["Th", "Kc", "5d", "2h", "Ks"],
    actions: [
      ...PREFLOP,
      { street: "FLOP", actor: "Player 5", action: "BET", amount: 500 },
      { street: "FLOP", actor: "Player 1", action: "FOLD" },
      { street: "FLOP", actor: "Player 2", action: "FOLD" },
      { street: "FLOP", actor: "Hero", action: "FOLD" },
      { street: "TURN", actor: "Player 5", action: "CHECK" },
      { street: "RIVER", actor: "Player 5", action: "CHECK" },
    ],
  });

  it("текстура и опасности считаются только по флопу", () => {
    const out = renderHandFacts(folded);
    expect(out).toContain("Текстура борда на флопе");
    expect(out).not.toContain("Текстура борда на тёрне");
    expect(out).not.toContain("Текстура борда на ривере");
    expect(out).not.toContain("Опасность борда на тёрне");
    expect(out).not.toContain("Опасность борда на ривере");
  });

  it("флеш-сводка не выдаёт флеш-дро с карт, которых Hero не видел", () => {
    // По итоговому борду у Hero было бы 2 черва в руке + 2 на борде (флеш-дро к риверу).
    // На флопе черва одна — никакого дро не было, и говорить о нём нельзя.
    const out = renderHandFacts(folded);
    expect(out).not.toContain("флеш-дро червей");
    expect(out).toContain("Флеш-угроза");
  });
});

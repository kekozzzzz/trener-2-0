import { describe, it, expect } from "vitest";
import { renderActionOrder, heroFirstPostflop } from "@/parser/action-order";
import type { TableSnapshot } from "@/parser/types";

function snap(partial: Partial<TableSnapshot>): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions: [], potTotal: 0, ...partial };
}

describe("renderActionOrder — фаза A: порядок хода относительно Hero", () => {
  // Баг коуча: тренер написал «оба соперника чекают перед тобой», а на деле Hero на CO,
  // до него чекнул один (BB), а за ним ещё живой баттон.
  it("многовей-ривер: один чек до Hero, баттон позади — не «оба перед тобой»", () => {
    const s = snap({
      seats: [
        { label: "Player 2", position: "BB", positionName: "BB", startingStack: 2000 },
        { label: "Hero", position: "CO", positionName: "CO", startingStack: 2000 },
        { label: "Player 6", position: "BTN", positionName: "BTN", startingStack: 2000 },
      ],
      board: ["Ah", "Kd", "Qs", "3c", "2d"],
      actions: [
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 20 },
        { street: "PREFLOP", actor: "Player 6", action: "CALL", amount: 20 },
        { street: "PREFLOP", actor: "Player 2", action: "CHECK" },
        { street: "FLOP", actor: "Player 2", action: "CHECK" },
        { street: "FLOP", actor: "Hero", action: "CHECK" },
        { street: "FLOP", actor: "Player 6", action: "CHECK" },
        { street: "TURN", actor: "Player 2", action: "CHECK" },
        { street: "TURN", actor: "Hero", action: "CHECK" },
        { street: "TURN", actor: "Player 6", action: "CHECK" },
        { street: "RIVER", actor: "Player 2", action: "CHECK" },
        { street: "RIVER", actor: "Hero", action: "CHECK" },
        { street: "RIVER", actor: "Player 6", action: "CHECK" },
      ],
    });
    const out = renderActionOrder(s);
    expect(out).toContain("На ривере до тебя: BB чек; за тобой ещё не действовали: BTN.");
    // Ключевое: НЕ говорит, что Hero закрывает улицу (за ним баттон).
    expect(out).not.toContain("ты закрываешь");
  });

  it("Hero на баттоне закрывает улицу: все чекнули до него", () => {
    const s = snap({
      seats: [
        { label: "Player 1", position: "SB", positionName: "SB", startingStack: 2000 },
        { label: "Player 2", position: "BB", positionName: "BB", startingStack: 2000 },
        { label: "Hero", position: "BTN", positionName: "BTN", startingStack: 2000 },
      ],
      board: ["Ah", "Kd", "Qs"],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 20 },
        { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 10 },
        { street: "PREFLOP", actor: "Player 2", action: "CHECK" },
        { street: "FLOP", actor: "Player 1", action: "CHECK" },
        { street: "FLOP", actor: "Player 2", action: "CHECK" },
        { street: "FLOP", actor: "Hero", action: "CHECK" },
      ],
    });
    const out = renderActionOrder(s);
    expect(out).toContain("На флопе до тебя: SB чек, BB чек; за тобой никого — ты закрываешь улицу.");
  });

  it("Hero ходит первым (SB) — за ним весь стол", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "SB", positionName: "SB", startingStack: 2000 },
        { label: "Player 2", position: "BB", positionName: "BB", startingStack: 2000 },
      ],
      board: ["Ah", "Kd", "Qs"],
      actions: [
        { street: "PREFLOP", actor: "Hero", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 10 },
        { street: "PREFLOP", actor: "Player 2", action: "CHECK" },
        { street: "FLOP", actor: "Hero", action: "CHECK" },
        { street: "FLOP", actor: "Player 2", action: "BET", amount: 20 },
      ],
    });
    const out = renderActionOrder(s);
    expect(out).toContain("На флопе ты ходишь первым; за тобой ещё не действовали: BB.");
  });

  it("сброс на флопе не тянется в «позади» на тёрне", () => {
    const s = snap({
      seats: [
        { label: "Player 2", position: "BB", positionName: "BB", startingStack: 2000 },
        { label: "Hero", position: "CO", positionName: "CO", startingStack: 2000 },
        { label: "Player 6", position: "BTN", positionName: "BTN", startingStack: 2000 },
      ],
      board: ["Ah", "Kd", "Qs", "3c"],
      actions: [
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 20 },
        { street: "PREFLOP", actor: "Player 6", action: "CALL", amount: 20 },
        { street: "PREFLOP", actor: "Player 2", action: "CHECK" },
        { street: "FLOP", actor: "Player 2", action: "CHECK" },
        { street: "FLOP", actor: "Hero", action: "BET", amount: 40 },
        { street: "FLOP", actor: "Player 6", action: "FOLD" },
        { street: "FLOP", actor: "Player 2", action: "CALL", amount: 40 },
        { street: "TURN", actor: "Player 2", action: "CHECK" },
        { street: "TURN", actor: "Hero", action: "CHECK" },
      ],
    });
    const out = renderActionOrder(s);
    // На тёрне BTN уже сбросил — «за тобой» его нет; за Hero вообще никого.
    expect(out).toContain("На тёрне до тебя: BB чек; за тобой никого — ты закрываешь улицу.");
    expect(out).not.toContain("На тёрне до тебя: BB чек; за тобой ещё не действовали: BTN");
  });

  it("префлоп-олл-ин без флопа, Hero закрывает (за ним никого) → пусто", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BB", positionName: "BB", startingStack: 200 },
        { label: "Player 1", position: "BTN", positionName: "BTN", startingStack: 200 },
      ],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 200 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 180 },
      ],
    });
    expect(renderActionOrder(s)).toBe("");
  });

  // Свип: сквиз-риск — кто ещё сидит за спиной Hero на префлопе (мог зайти/сквизнуть).
  // Блайнды-форсы НЕ должны попадать в порядок хода (иначе SB/BB ложно уедут в начало).
  it("префлоп сквиз-риск: Hero открывает с MP, за ним три живых", () => {
    const s = snap({
      seats: [
        { label: "Player 1", position: "SB", positionName: "SB", startingStack: 2000 },
        { label: "Player 2", position: "BB", positionName: "BB", startingStack: 2000 },
        { label: "Hero", position: "EARLY", positionName: "MP", startingStack: 2000 },
        { label: "Player 5", position: "CO", positionName: "CO", startingStack: 2000 },
        { label: "Player 6", position: "BTN", positionName: "BTN", startingStack: 2000 },
      ],
      board: ["Ah", "Kd", "Qs"],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 50 },
        { street: "PREFLOP", actor: "Player 5", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 6", action: "CALL", amount: 50 },
        { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
        { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 30 },
        { street: "FLOP", actor: "Player 2", action: "CHECK" },
        { street: "FLOP", actor: "Hero", action: "BET", amount: 60 },
        { street: "FLOP", actor: "Player 6", action: "FOLD" },
        { street: "FLOP", actor: "Player 2", action: "FOLD" },
      ],
    });
    const out = renderActionOrder(s);
    // Hero первый добровольный (блайнды-форсы отфильтрованы), за ним CO, BTN, SB, BB.
    expect(out).toContain("На префлопе ты действуешь первым; за тобой оставались CO, BTN, SB, BB - 4 могли войти или сквизнуть.");
    // Блайнды-форсы не увели SB/BB в начало «до тебя».
    expect(out).not.toContain("до тебя: SB");
  });
});

// heroFirstPostflop — включатель сторожа порядка хода в cleanCoachText. true ТОЛЬКО если Hero
// ходит первым на каждой постфлоп-улице с экшном (тогда «соперники до тебя» = ложь). Если Hero
// хоть где-то в позиции — false (там «перед тобой» законно, сторож выключаем).
describe("heroFirstPostflop — включатель сторожа порядка", () => {
  it("Hero на SB, чек первым на флопе (реальная раздача 5♦4♦) → true", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "SB", positionName: "SB", startingStack: 2000 },
        { label: "Player 5", position: "CO", positionName: "CO", startingStack: 2000 },
        { label: "Player 6", position: "BTN", positionName: "BTN", startingStack: 2000 },
      ],
      board: ["Kd", "5h", "Jh"],
      actions: [
        { street: "PREFLOP", actor: "Hero", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Player 5", action: "CALL", amount: 20 },
        { street: "PREFLOP", actor: "Player 6", action: "CALL", amount: 20 },
        { street: "FLOP", actor: "Hero", action: "CHECK" },
        { street: "FLOP", actor: "Player 5", action: "CHECK" },
        { street: "FLOP", actor: "Player 6", action: "CHECK" },
      ],
    });
    expect(heroFirstPostflop(s)).toBe(true);
  });

  it("Hero на CO, до него ходил BB на флопе → false (сторож не включаем)", () => {
    const s = snap({
      seats: [
        { label: "Player 2", position: "BB", positionName: "BB", startingStack: 2000 },
        { label: "Hero", position: "CO", positionName: "CO", startingStack: 2000 },
        { label: "Player 6", position: "BTN", positionName: "BTN", startingStack: 2000 },
      ],
      board: ["Ah", "Kd", "Qs"],
      actions: [
        { street: "FLOP", actor: "Player 2", action: "CHECK" },
        { street: "FLOP", actor: "Hero", action: "CHECK" },
        { street: "FLOP", actor: "Player 6", action: "CHECK" },
      ],
    });
    expect(heroFirstPostflop(s)).toBe(false);
  });

  it("Hero закрывает флоп (BTN, все до него) → false", () => {
    const s = snap({
      seats: [
        { label: "Player 1", position: "SB", positionName: "SB", startingStack: 2000 },
        { label: "Hero", position: "BTN", positionName: "BTN", startingStack: 2000 },
      ],
      board: ["Ah", "Kd", "Qs"],
      actions: [
        { street: "FLOP", actor: "Player 1", action: "CHECK" },
        { street: "FLOP", actor: "Hero", action: "CHECK" },
      ],
    });
    expect(heroFirstPostflop(s)).toBe(false);
  });

  it("без постфлоп-экшна (префлоп-олл-ин) → false — судить не о чем", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "SB", positionName: "SB", startingStack: 200 },
        { label: "Player 1", position: "BTN", positionName: "BTN", startingStack: 200 },
      ],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "RAISE", amount: 200 },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 190 },
      ],
    });
    expect(heroFirstPostflop(s)).toBe(false);
  });
});

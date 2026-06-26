import { describe, it, expect } from "vitest";
import { tableStateUpTo, lastActionIndex, boardUpToStreet } from "@/parser/table-state";
import type { TableSnapshot } from "@/parser/types";

// Снимок на 40bb (BB=100). Hero на BTN. Префлоп: HJ фолд, CO колл, Hero рейз,
// SB фолд, BB колл. Флоп K72r: BB чек, Hero бет, CO фолд, BB колл. Тёрн: оба чек.
// Индексы действий: [0] SB пост … [4] Hero RAISE … [9] Hero BET … [13] Hero CHECK.
function snap(): TableSnapshot {
  return {
    seats: [
      { label: "Player 1", position: "SB", startingStack: 4000, seatNumber: 1 },
      { label: "Player 2", position: "BB", startingStack: 4000, seatNumber: 2 },
      { label: "Player 3", position: "HJ", startingStack: 4000, seatNumber: 3 },
      { label: "Player 4", position: "CO", startingStack: 4000, seatNumber: 4 },
      { label: "Hero", position: "BTN", startingStack: 4000, seatNumber: 5 },
    ],
    tableSize: 6,
    buttonSeat: 5,
    heroCards: ["As", "Ks"],
    board: ["Kd", "7h", "2c", "9s", "3d"],
    actions: [
      { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 50 }, // 0
      { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 }, // 1
      { street: "PREFLOP", actor: "Player 3", action: "FOLD" }, // 2
      { street: "PREFLOP", actor: "Player 4", action: "CALL", amount: 100 }, // 3
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 300 }, // 4
      { street: "PREFLOP", actor: "Player 1", action: "FOLD" }, // 5
      { street: "PREFLOP", actor: "Player 2", action: "CALL", amount: 200 }, // 6
      { street: "PREFLOP", actor: "Player 4", action: "CALL", amount: 200 }, // 7
      { street: "FLOP", actor: "Player 2", action: "CHECK" }, // 8
      { street: "FLOP", actor: "Hero", action: "BET", amount: 500 }, // 9
      { street: "FLOP", actor: "Player 4", action: "FOLD" }, // 10
      { street: "FLOP", actor: "Player 2", action: "CALL", amount: 500 }, // 11
      { street: "TURN", actor: "Player 2", action: "CHECK" }, // 12
      { street: "TURN", actor: "Hero", action: "CHECK" }, // 13
    ],
    potTotal: 0,
  };
}

const seatBy = (state: ReturnType<typeof tableStateUpTo>, label: string) =>
  state.seats.find((s) => s.label === label)!;

describe("boardUpToStreet", () => {
  it("режет борд по улице", () => {
    const board = ["Kd", "7h", "2c", "9s", "3d"];
    expect(boardUpToStreet(board, "PREFLOP")).toEqual([]);
    expect(boardUpToStreet(board, "FLOP")).toEqual(["Kd", "7h", "2c"]);
    expect(boardUpToStreet(board, "TURN")).toEqual(["Kd", "7h", "2c", "9s"]);
    expect(boardUpToStreet(board, "RIVER")).toEqual(["Kd", "7h", "2c", "9s", "3d"]);
  });
});

describe("tableStateUpTo", () => {
  it("на рейзе Hero (idx 4): точка решения — Hero, банк и пустой борд", () => {
    const s = tableStateUpTo(snap(), 4);
    expect(s.street).toBe("PREFLOP");
    expect(s.board).toEqual([]);
    expect(s.bigBlind).toBe(100);
    expect(s.decisionActor).toBe("Hero");
    // банк: SB 50 + BB 100 + CO колл 100 + Hero рейз 300 = 550
    expect(s.potSoFar).toBe(550);
    expect(seatBy(s, "Hero").lastAction).toEqual({ action: "RAISE", amount: 300 });
    expect(seatBy(s, "Hero").isCurrent).toBe(true);
    // фишки на улице перед игроком: Hero рейз до 300, CO долил до 100, SB блайнд 50
    expect(seatBy(s, "Hero").streetBet).toBe(300);
    expect(seatBy(s, "Player 4").streetBet).toBe(100);
    expect(seatBy(s, "Player 1").streetBet).toBe(50);
    // размер стола из снимка (6-max), хотя сидят пятеро
    expect(s.tableSize).toBe(6);
    // после Hero (BTN) на префлопе ещё ходят SB и BB (живы) → 2
    expect(s.playersAfterHero).toBe(2);
    expect(seatBy(s, "Player 4").lastAction).toEqual({ action: "CALL", amount: 100 });
    expect(seatBy(s, "Player 3").folded).toBe(true);
    // BB до этого момента только постил блайнд (форс — не «последнее действие»)
    expect(seatBy(s, "Player 2").lastAction).toBeNull();
    // P1 ещё не сфолдил (фолд на idx 5)
    expect(seatBy(s, "Player 1").folded).toBe(false);
  });

  it("на бете Hero на флопе (idx 9): борд из 3 карт, точка — Hero", () => {
    const s = tableStateUpTo(snap(), 9);
    expect(s.street).toBe("FLOP");
    expect(s.board).toEqual(["Kd", "7h", "2c"]);
    expect(s.decisionActor).toBe("Hero");
    expect(seatBy(s, "Hero").lastAction).toEqual({ action: "BET", amount: 500 });
    // банк = префлоп 950 + Hero бет 500 = 1450
    expect(s.potSoFar).toBe(1450);
    // CO ещё не сфолдил на этот момент (фолд на idx 10)
    expect(seatBy(s, "Player 4").folded).toBe(false);
  });

  it("некорректный индекс зажимается в границы (не падает)", () => {
    const s = tableStateUpTo(snap(), 999);
    expect(s.decisionActor).toBe("Hero"); // последнее действие — чек Hero на тёрне
    expect(seatBy(s, "Player 4").folded).toBe(true);
  });
});

// Ровно кейс из требования: соперник пошёл в олл-ин (пуш), Hero его коллирует.
// Стол должен показывать именно этот пуш как точку решения, когда тренер спрашивает
// про диапазон, под который Hero коллировал.
function pushSnap(): TableSnapshot {
  return {
    seats: [
      { label: "Player 1", position: "SB", startingStack: 2000, seatNumber: 1 },
      { label: "Player 2", position: "BB", startingStack: 2000, seatNumber: 2 },
      { label: "Hero", position: "BTN", startingStack: 2000, seatNumber: 3 },
    ],
    tableSize: 3,
    buttonSeat: 3,
    heroCards: ["Ah", "Qd"],
    board: [],
    actions: [
      { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 50 }, // 0
      { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 }, // 1
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 }, // 2
      { street: "PREFLOP", actor: "Player 1", action: "FOLD" }, // 3
      { street: "PREFLOP", actor: "Player 2", action: "ALL_IN", amount: 2000 }, // 4 — пуш
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 1750 }, // 5 — колл пуша
    ],
    potTotal: 0,
  };
}

describe("tableStateUpTo — момент пуша соперника", () => {
  it("на пуше (idx 4): точка решения — соперник, его последнее действие ОЛЛ-ИН", () => {
    const s = tableStateUpTo(pushSnap(), 4);
    expect(s.decisionActor).toBe("Player 2");
    expect(seatBy(s, "Player 2").lastAction).toEqual({ action: "ALL_IN", amount: 2000 });
    expect(seatBy(s, "Player 2").isCurrent).toBe(true);
    // после Hero (BTN, ходит первым 3-max) живым остаётся BB (SB сфолдил) → 1
    expect(s.playersAfterHero).toBe(1);
    // Hero ещё не ответил на пуш — его последнее действие предыдущий рейз
    expect(seatBy(s, "Hero").lastAction).toEqual({ action: "RAISE", amount: 250 });
    expect(seatBy(s, "Hero").isCurrent).toBe(false);
    // банк: SB 50 + BB 100 + Hero рейз 250 + пуш (2000−100 уже вложенных) 1900 = 2300
    expect(s.potSoFar).toBe(2300);
  });

  it("на колле пуша (idx 5): точка — Hero, пуш соперника всё ещё виден", () => {
    const s = tableStateUpTo(pushSnap(), 5);
    expect(s.decisionActor).toBe("Hero");
    expect(seatBy(s, "Hero").lastAction).toEqual({ action: "CALL", amount: 1750 });
    expect(seatBy(s, "Player 2").lastAction).toEqual({ action: "ALL_IN", amount: 2000 });
    expect(s.potSoFar).toBe(4050);
  });
});

describe("lastActionIndex", () => {
  it("возвращает индекс последнего действия", () => {
    expect(lastActionIndex(snap())).toBe(13);
    expect(lastActionIndex(pushSnap())).toBe(5);
  });
});

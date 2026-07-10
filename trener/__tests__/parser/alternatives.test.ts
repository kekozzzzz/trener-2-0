import { describe, it, expect } from "vitest";
import type { TableSnapshot } from "@/parser/types";
import { alternativeRaises, nodeStateAt } from "@/parser/alternatives";

// Раздача Фазы 1: 8-max, 50 BB, анте 1 BB. BTN open 2.1 BB, Hero(BB) колл.
// Флоп K♠9♠3♥ (чек - бет 1/3 190 - колл), Тёрн 7♣ (чек - бет 1/2 475 - колл), Ривер 2♥ (чек-чек).
// Hero A♠5♠ - нат-флеш-дро. Линия колл-колл-чек: на флопе и тёрне была альтернатива рейз-полу-блеф.
function buildSnap(heroCards: string[], board: string[]): TableSnapshot {
  return {
    seats: [
      { label: "Player 1", position: "EARLY", positionName: "UTG", startingStack: 5000, seatNumber: 1 },
      { label: "Player 2", position: "EARLY", positionName: "UTG+1", startingStack: 5000, seatNumber: 2 },
      { label: "Player 3", position: "EARLY", positionName: "LJ", startingStack: 5000, seatNumber: 3 },
      { label: "Player 4", position: "HJ", positionName: "HJ", startingStack: 5000, seatNumber: 4 },
      { label: "Player 5", position: "CO", positionName: "CO", startingStack: 5000, seatNumber: 5 },
      { label: "Player 6", position: "BTN", positionName: "BTN", startingStack: 5000, seatNumber: 6 },
      { label: "Player 7", position: "SB", positionName: "SB", startingStack: 5000, seatNumber: 7 },
      { label: "Hero", position: "BB", positionName: "BB", startingStack: 5000, seatNumber: 8 },
    ],
    heroCards,
    board,
    tableSize: 8,
    buttonSeat: 6,
    potTotal: 3800,
    actions: [
      { street: "PREFLOP", actor: "Hero", action: "POST_ANTE", amount: 100 },
      { street: "PREFLOP", actor: "Player 7", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 4", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 5", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 6", action: "RAISE", amount: 210 },
      { street: "PREFLOP", actor: "Player 7", action: "FOLD" },
      { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 110 },
      { street: "FLOP", actor: "Hero", action: "CHECK" },
      { street: "FLOP", actor: "Player 6", action: "BET", amount: 190 },
      { street: "FLOP", actor: "Hero", action: "CALL", amount: 190 },
      { street: "TURN", actor: "Hero", action: "CHECK" },
      { street: "TURN", actor: "Player 6", action: "BET", amount: 475 },
      { street: "TURN", actor: "Hero", action: "CALL", amount: 475 },
      { street: "RIVER", actor: "Hero", action: "CHECK" },
      { street: "RIVER", actor: "Player 6", action: "CHECK" },
    ],
  };
}

describe("alternativeRaises — рейз-полу-блеф на пассивном колле дро", () => {
  const snap = buildSnap(["As", "5s"], ["Ks", "9s", "3h", "7c", "2h"]);
  const alts = alternativeRaises(snap);

  it("находит ровно две ветки (флоп + тёрн), обе полу-блеф с дро", () => {
    expect(alts).toHaveLength(2);
    expect(alts.map((a) => a.street)).toEqual(["FLOP", "TURN"]);
    expect(alts.every((a) => a.reason === "SEMI_BLUFF_DRAW")).toBe(true);
    expect(alts.every((a) => a.actualAction === "CALL")).toBe(true);
  });

  it("флоп: фолд-эквити 43%, банк при колле 1710 (корректный учёт, не 1900)", () => {
    const flop = alts[0];
    expect(flop.villainBet).toBe(190);
    expect(flop.raiseTo).toBe(570); // 3x ставки
    expect(flop.risk).toBe(570);
    expect(flop.foldsNeededPct).toBe(43); // доля диапазона, которая должна сброситься
    expect(flop.potIfCalled).toBe(1710); // 760 + 570 + (570-190). НЕ 1900
    expect(flop.drawEquityRawPct).toBe(36); // нат-флеш-дро, 9 аутов, к риверу (2 карты)
    expect(flop.drawEquityCleanPct).toBe(23);
    expect(flop.outsRaw).toBe(9);
  });

  it("тёрн: фолд-эквити 50% (бет полбанка → рейз 3x = 50%), одна карта к риверу", () => {
    const turn = alts[1];
    expect(turn.villainBet).toBe(475);
    expect(turn.raiseTo).toBe(1425);
    expect(turn.foldsNeededPct).toBe(50);
    expect(turn.potIfCalled).toBe(3800); // 1425 + 1425 + (1425-475)
    expect(turn.drawEquityRawPct).toBe(20); // 9 аутов, 1 карта
  });

  it("SPR в узле считается по остатку к банку ЭТОГО момента, не флопа", () => {
    // Флоп-узел: банк 760, эффективный остаток 4600 → SPR ≈ 6.1
    const flopNode = nodeStateAt(snap, 12); // индекс BET Player6 190
    expect(flopNode.pot).toBe(760);
    expect(flopNode.toCall).toBe(190);
    expect(flopNode.spr).toBe(6.1);
  });
});

describe("alternativeRaises — глушим, когда дро нет", () => {
  it("оверпара без дро (AA на K93 радуга) → ни одной подсказки рейза", () => {
    const snap = buildSnap(["As", "Ad"], ["Kh", "9c", "3d", "7s", "2c"]);
    expect(alternativeRaises(snap)).toHaveLength(0);
  });

  it("гатшот (мало аутов) не проходит порог сильного дро", () => {
    // A♠2♠ на J♠5♥4♠: гатшот к 3 + флеш-дро пик — это сильное дро, должно пройти;
    // проверяем обратное на чистом гатшоте без флеша: 8♦7♦ на J♠5♥4♣ (нужна 6, ~4 аута)
    const snap = buildSnap(["8d", "7d"], ["Js", "5h", "4c", "2h", "2s"]);
    expect(alternativeRaises(snap)).toHaveLength(0);
  });
});

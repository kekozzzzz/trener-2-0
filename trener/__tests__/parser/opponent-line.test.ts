import { describe, it, expect } from "vitest";
import { renderOpponentLines } from "@/parser/opponent-line";
import { isBountyTournament } from "@/config/tournament-format";
import type { TableSnapshot } from "@/parser/types";

function snap(partial: Partial<TableSnapshot>): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions: [], potTotal: 0, ...partial };
}

describe("renderOpponentLines — фаза 5: линия соперника по улицам", () => {
  it("собирает опен → чек → бет по улицам одной строкой", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BB", positionName: "BB", startingStack: 2000 },
        { label: "Player 5", position: "CO", positionName: "CO", startingStack: 2000 },
        { label: "Player 1", position: "SB", positionName: "SB", startingStack: 2000 },
      ],
      board: ["2c", "7h", "Kd", "9s"],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 10 },
        { street: "PREFLOP", actor: "Hero", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Player 5", action: "RAISE", amount: 50 },
        { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
        { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 30 },
        // банк к флопу = 110
        { street: "FLOP", actor: "Hero", action: "CHECK" },
        { street: "FLOP", actor: "Player 5", action: "CHECK" },
        { street: "TURN", actor: "Hero", action: "CHECK" },
        { street: "TURN", actor: "Player 5", action: "BET", amount: 40 }, // ~36% банка
      ],
    });
    const out = renderOpponentLines(s);
    expect(out).toContain("Линия CO (Player 5)");
    expect(out).toContain("префлоп опен 2.5 BB");
    expect(out).toContain("флоп чек");
    expect(out).toContain("тёрн бет");
    // SB только сбросил префлоп без вложений — в линиях его нет.
    expect(out).not.toContain("Player 1");
  });

  it("только Hero вкладывался → пусто", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BTN", startingStack: 2000 },
        { label: "Player 1", position: "BB", startingStack: 2000 },
      ],
      actions: [
        { street: "PREFLOP", actor: "Player 1", action: "POST_BB", amount: 20 },
        { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 50 },
        { street: "PREFLOP", actor: "Player 1", action: "FOLD" },
      ],
    });
    expect(renderOpponentLines(s)).toBe("");
  });
});

describe("isBountyTournament — фаза 5: нокаут-флаг по названию", () => {
  it("узнаёт баунти/нокаут форматы", () => {
    expect(isBountyTournament("Bounty Hunters Deepstack Turbo $5.40")).toBe(true);
    expect(isBountyTournament("GGMasters KO $25")).toBe(true);
    expect(isBountyTournament("Mystery Bounty $50")).toBe(true);
    expect(isBountyTournament("PKO Big Deal")).toBe(true);
    expect(isBountyTournament("Нокаут Спешл")).toBe(true);
  });

  it("обычные турниры — не баунти", () => {
    expect(isBountyTournament("Sunday Million")).toBe(false);
    expect(isBountyTournament("Daily Deepstack $10")).toBe(false);
    expect(isBountyTournament(null)).toBe(false);
    expect(isBountyTournament(undefined)).toBe(false);
  });
});

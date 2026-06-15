import { describe, it, expect } from "vitest";
import { bigBlindFromSnapshot } from "@/parser/big-blind";
import type { TableSnapshot } from "@/parser/types";

function snapshotWith(actions: TableSnapshot["actions"]): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions, potTotal: 0 };
}

describe("bigBlindFromSnapshot", () => {
  it("берёт сумму действия POST_BB", () => {
    const snap = snapshotWith([
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Player 3", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 },
    ]);
    expect(bigBlindFromSnapshot(snap)).toBe(100);
  });

  it("при нескольких POST_BB возвращает максимум", () => {
    const snap = snapshotWith([
      { street: "PREFLOP", actor: "Player 3", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Player 5", action: "POST_BB", amount: 100 },
    ]);
    expect(bigBlindFromSnapshot(snap)).toBe(100);
  });

  it("возвращает null, если POST_BB нет", () => {
    const snap = snapshotWith([
      { street: "PREFLOP", actor: "Hero", action: "FOLD" },
    ]);
    expect(bigBlindFromSnapshot(snap)).toBeNull();
  });
});

/**
 * Признак поздней стадии турнира → тренер СПРАШИВАЕТ, а не выдумывает (идея Артёма 20.07:
 * «давай будем спрашивать, если стол 3-4 макс и уровни большие»).
 *
 * Пороги: основной признак — средний стек за столом в BB (структурно-независим), вспомогательные —
 * номер уровня (калибровка под турниры Артёма) и короткий стол. Проверка по внешним источникам
 * показала, что стадию задают размеры стеков и близость выплат, а не номер уровня, поэтому
 * на одном уровне полагаться нельзя.
 */

import { describe, it, expect } from "vitest";
import { stageHint } from "@/config/poker/tournament-stage";
import { renderHandFacts } from "@/parser/facts";
import type { Seat, TableAction, TableSnapshot } from "@/parser/types";

describe("stageHint — когда спрашивать про стадию", () => {
  it("ранняя дистанция — молчим (не сыпем вопросами)", () => {
    expect(stageHint(3, 8, 120)).toBeNull();
    expect(stageHint(11, 8, 45)).toBeNull();
  });

  it("ориентир Артёма «уровень 15 ≈ около бабло» → спрашиваем про район денег", () => {
    expect(stageHint(15, 8, 35)).toBe("NEAR_MONEY");
  });

  it("ориентир Артёма «уровень 20 ≈ финалка/предфинал» → спрашиваем про финалку", () => {
    expect(stageHint(20, 8, 27)).toBe("FINAL_TABLE");
  });

  it("короткий стол — самостоятельный признак, даже без уровня", () => {
    expect(stageHint(null, 3, 40)).toBe("FINAL_TABLE");
    expect(stageHint(6, 4, 50)).toBe("FINAL_TABLE");
  });

  it("уровня нет (рум его не пишет), но средний стек короткий — признак работает", () => {
    expect(stageHint(null, 7, 25)).toBe("FINAL_TABLE");
    expect(stageHint(null, 7, 33)).toBe("NEAR_MONEY");
  });

  it("уровня нет и стеки глубокие — молчим", () => {
    expect(stageHint(null, 9, 90)).toBeNull();
  });
});

describe("факт в промпте — догадка, а не утверждение", () => {
  const snap = (level: number | undefined, seatCount: number, stack: number): TableSnapshot => ({
    seats: Array.from({ length: seatCount }, (_, i) => ({
      label: i === 0 ? "Hero" : `Player ${i + 1}`,
      position: i === 0 ? "BB" : "CO",
      startingStack: stack,
      seatNumber: i + 1,
    })) as Seat[],
    heroCards: ["Ah", "Kd"],
    board: [],
    potTotal: 0,
    level,
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 1000 } as TableAction,
      { street: "PREFLOP", actor: "Hero", action: "FOLD" } as TableAction,
    ],
  });

  it("на поздней стадии факт велит СПРОСИТЬ и запрещает утверждать", () => {
    const r = renderHandFacts(snap(22, 8, 25000)); // 25 BB средний стек, уровень 22
    expect(r).toContain("Признак поздней стадии турнира");
    expect(r).toContain("ДОГАДКА по косвенным признакам");
    expect(r).toContain("СПРОСИ игрока");
    expect(r).toContain("НЕ утверждай стадию");
  });

  it("если игрок скажет, что до денег далеко — про ICM не рассуждать", () => {
    expect(renderHandFacts(snap(22, 8, 25000))).toContain("про ICM и «выживание» не рассуждай вовсе");
  });

  it("на ранней дистанции факта нет вовсе", () => {
    const r = renderHandFacts(snap(3, 8, 120000)); // 120 BB, уровень 3
    expect(r).not.toContain("Признак поздней стадии турнира");
  });
});

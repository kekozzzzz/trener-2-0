/**
 * Тесты детерминированного агрегатора характеристики игрока
 * (features/profile/aggregate.ts, plans/2026-06-25-характеристика-игрока.md).
 *
 * Чистая функция, без БД. Покрывают: средние и распределение стилей, выбор
 * доминирующего стиля (с тай-брейком), агрегацию открывашек шире нормы по всем
 * раздачам (частота + сортировка), и null при отсутствии турниров.
 */

import { describe, it, expect } from "vitest";
import type { Position, TableAction, TableSnapshot } from "@/parser/types";
import { aggregatePlayerCharacteristic, type CountedTournament } from "@/features/profile/aggregate";

// Стол на 40bb (BB=100): Hero открывается рейзом первым из заданной позиции.
function openSnap(heroCards: string[], position: Position): { tableData: TableSnapshot } {
  const actions: TableAction[] = [
    { street: "PREFLOP", actor: "Player 1", action: "POST_SB", amount: 50 },
    { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: 100 },
    { street: "PREFLOP", actor: "Player 3", action: "FOLD" },
    { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
  ];
  return {
    tableData: {
      seats: [
        { label: "Player 1", position: "SB", startingStack: 4000 },
        { label: "Player 2", position: "BB", startingStack: 4000 },
        { label: "Hero", position, startingStack: 4000 },
      ],
      heroCards,
      board: [],
      actions,
      potTotal: 0,
    },
  };
}

const t = (vpip: number, buyins: number, hands: number, style: CountedTournament["styleDiagnosis"]): CountedTournament => ({
  vpipPercent: vpip,
  resultBuyins: buyins,
  handsCount: hands,
  styleDiagnosis: style,
});

describe("aggregatePlayerCharacteristic", () => {
  it("считает средние, распределение и доминирующий стиль", () => {
    const facts = aggregatePlayerCharacteristic(
      [t(40, -1, 100, "AGGRESSIVE"), t(50, 2, 120, "AGGRESSIVE"), t(30, -1, 80, "TIGHT")],
      [],
    );

    expect(facts).not.toBeNull();
    expect(facts!.tournamentsCounted).toBe(3);
    expect(facts!.avgVpip).toBe(40); // (40+50+30)/3
    expect(facts!.avgResultBuyins).toBe(0); // (-1+2-1)/3 = 0
    expect(facts!.avgHandsCount).toBe(100); // (100+120+80)/3
    expect(facts!.styleCounts).toEqual({ LOOSE: 0, TIGHT: 1, PASSIVE: 0, AGGRESSIVE: 2 });
    expect(facts!.dominantStyle).toBe("AGGRESSIVE");
    expect(facts!.openLeak).toEqual([]);
  });

  it("при равенстве стилей выбирает по приоритету LOOSE > TIGHT > PASSIVE > AGGRESSIVE", () => {
    const facts = aggregatePlayerCharacteristic([t(30, 0, 90, "TIGHT"), t(45, 0, 90, "AGGRESSIVE")], []);
    expect(facts!.dominantStyle).toBe("TIGHT");
  });

  it("агрегирует открывашки шире нормы по всем раздачам: частота + сортировка", () => {
    const hands = [
      openSnap(["Kc", "4c"], "EARLY"), // K4s с ранней — шире нормы (чарт K6s+)
      openSnap(["Kd", "4d"], "EARLY"), // ещё раз K4s
      openSnap(["Qc", "6c"], "EARLY"), // Q6s с ранней — шире нормы (чарт Q8s+)
      openSnap(["Ac", "Kc"], "EARLY"), // AKs — в диапазоне, не флаг
    ];

    const facts = aggregatePlayerCharacteristic([t(40, 0, 100, "LOOSE")], hands);

    // Hero-место EARLY без positionName → чарт-позиция MP (см. openChartPosition).
    expect(facts!.openLeak).toEqual([
      { position: "MP", code: "K4s", count: 2 },
      { position: "MP", code: "Q6s", count: 1 },
    ]);
  });

  it("нет турниров — возвращает null (строить не из чего)", () => {
    expect(aggregatePlayerCharacteristic([], [])).toBeNull();
  });
});

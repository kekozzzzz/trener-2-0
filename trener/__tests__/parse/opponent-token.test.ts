/**
 * Тесты обезличенного токена оппонента (infrastructure/parse/opponent-token.ts).
 * Приватность: стабильный внутри турнира, разный между турнирами/людьми, необратим,
 * не равен исходному нику. Секрет — SESSION_SECRET.
 */

import { describe, it, expect, beforeAll } from "vitest";
import type { ParsedTournament } from "@/parser/types";
import { opponentToken, applyOpponentTokens } from "@/infrastructure/parse/opponent-token";

beforeAll(() => {
  process.env.SESSION_SECRET ||= "test-secret-for-opponent-token";
});

describe("opponentToken", () => {
  it("стабилен для одного человека в рамках турнира", () => {
    expect(opponentToken("5dd4eff6", "T1")).toBe(opponentToken("5dd4eff6", "T1"));
  });

  it("разный для разных людей", () => {
    expect(opponentToken("5dd4eff6", "T1")).not.toBe(opponentToken("de1a1e43", "T1"));
  });

  it("разный для одного человека в разных турнирах (не кросс-турнирный)", () => {
    expect(opponentToken("5dd4eff6", "T1")).not.toBe(opponentToken("5dd4eff6", "T2"));
  });

  it("не равен исходному нику и не содержит его (необратим на глаз)", () => {
    const t = opponentToken("ProGrinder88", "T1");
    expect(t).not.toBe("ProGrinder88");
    expect(t.includes("ProGrinder88")).toBe(false);
    expect(t.length).toBe(16);
  });
});

describe("applyOpponentTokens — приватность (сырые ники не оседают)", () => {
  function tournament(): ParsedTournament {
    return {
      room: "GGPoker",
      externalTournamentId: "289598162",
      name: "Test",
      playedAt: "2026-06-11T20:00:00.000Z",
      handsCount: 1,
      vpipPercent: 0,
      pfrPercent: 0,
      postflopAggressionFactor: 0,
      resultBuyins: 0,
      styleDiagnosis: "TIGHT",
      hands: [
        {
          chipResult: 0,
          importanceLevel: "MEDIUM",
          playedAt: "2026-06-11T20:00:00.000Z",
          seatNames: { 1: "ProGrinder88", 2: "Hero", 3: "5dd4eff6" },
          tableSnapshot: {
            seats: [
              { label: "Player 1", position: "CO", startingStack: 4000, seatNumber: 1 },
              { label: "Hero", position: "BTN", startingStack: 4000, seatNumber: 2 },
              { label: "Player 3", position: "SB", startingStack: 4000, seatNumber: 3 },
            ],
            heroCards: ["Ac", "Kc"],
            board: [],
            actions: [],
            potTotal: 0,
          },
        },
      ],
    };
  }

  it("проставляет токены оппонентам, гасит Hero, УДАЛЯЕТ сырые имена и не оставляет ников в снимке", () => {
    const data = tournament();
    applyOpponentTokens(data);
    const h = data.hands[0];

    // Сырые имена стёрты — дальше в payload/БД не поедут.
    expect(h.seatNames).toBeUndefined();

    const [p1, hero, p3] = h.tableSnapshot.seats;
    // Оппоненты получили токен; Hero — нет.
    expect(p1.opponentToken).toBeTruthy();
    expect(p3.opponentToken).toBeTruthy();
    expect(hero.opponentToken).toBeUndefined();

    // Токен — НЕ ник: не равен и не содержит исходное имя.
    expect(p1.opponentToken).not.toBe("ProGrinder88");
    const dump = JSON.stringify(h.tableSnapshot);
    expect(dump.includes("ProGrinder88")).toBe(false);
    expect(dump.includes("5dd4eff6")).toBe(false);
  });
});

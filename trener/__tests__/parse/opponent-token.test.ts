/**
 * Тесты обезличенного токена оппонента (infrastructure/parse/opponent-token.ts).
 * Приватность: стабильный внутри турнира, разный между турнирами/людьми, необратим,
 * не равен исходному нику. Секрет — SESSION_SECRET.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { opponentToken } from "@/infrastructure/parse/opponent-token";

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

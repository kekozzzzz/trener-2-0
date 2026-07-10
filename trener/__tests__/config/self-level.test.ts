import { describe, it, expect } from "vitest";
import {
  isValidSelfLevel,
  isSelfLevelActive,
  SELF_LEVEL_MAX_TOURNAMENTS,
  SELF_LEVEL_MAX_HANDS,
  SELF_LEVEL_PROMPT_LABEL,
  SELF_LEVELS,
} from "@/config/self-level";

describe("self-level: валидация значения", () => {
  it("принимает только известные коды", () => {
    for (const code of SELF_LEVELS) expect(isValidSelfLevel(code)).toBe(true);
  });
  it("отвергает мусор, пустое и не-строки", () => {
    for (const bad of ["", "PRO", "new", null, undefined, 3]) {
      expect(isValidSelfLevel(bad)).toBe(false);
    }
  });
  it("для каждого кода есть подпись для промпта", () => {
    for (const code of SELF_LEVELS) expect(SELF_LEVEL_PROMPT_LABEL[code].length).toBeGreaterThan(0);
  });
});

describe("self-level: окно затухания (что раньше — турниры ИЛИ руки)", () => {
  it("активен на старте: мало турниров и мало рук", () => {
    expect(isSelfLevelActive({ tournamentsCounted: 3, handsCounted: 400 })).toBe(true);
  });
  it("гаснет по турнирам", () => {
    expect(isSelfLevelActive({ tournamentsCounted: SELF_LEVEL_MAX_TOURNAMENTS, handsCounted: 0 })).toBe(false);
  });
  it("гаснет по рукам раньше, чем по турнирам", () => {
    expect(isSelfLevelActive({ tournamentsCounted: 4, handsCounted: SELF_LEVEL_MAX_HANDS })).toBe(false);
  });
  it("граница: на 1 меньше обоих порогов — ещё активен", () => {
    expect(
      isSelfLevelActive({
        tournamentsCounted: SELF_LEVEL_MAX_TOURNAMENTS - 1,
        handsCounted: SELF_LEVEL_MAX_HANDS - 1,
      }),
    ).toBe(true);
  });
});

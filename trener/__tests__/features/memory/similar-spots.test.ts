import { describe, it, expect } from "vitest";
import type { SpotFingerprint } from "@/parser/spot-fingerprint";
import { selectPriorSpots } from "@/features/memory/similar-spots";

function fp(over: Partial<SpotFingerprint> = {}): SpotFingerprint {
  return {
    position: "BB",
    stack: "MID",
    role: "BBDEF",
    street: "FLOP",
    board: { suitedness: "MONOTONE", paired: false, connected: "CONNECTED" },
    connection: "WHIFF",
    ...over,
  };
}

function cand(fingerprint: SpotFingerprint, over: Record<string, unknown> = {}) {
  return {
    fp: fingerprint,
    cards: ["As", "Qc"],
    decision: "колл на флопе",
    reasoning: null,
    chipResult: -500,
    when: "Турнир X",
    ...over,
  };
}

describe("selectPriorSpots — анти-галлюцинация и метки", () => {
  const current = fp();

  it("идентичный спот → EXACT, отличие в одном признаке → SIMILAR", () => {
    const exact = cand(fp()); // счёт 6
    const similar = cand(fp({ connection: "DRAW" })); // счёт 5
    const result = selectPriorSpots(current, [similar, exact]);

    expect(result).toHaveLength(2);
    expect(result[0].matchLevel).toBe("EXACT"); // выше счёт — первым
    expect(result[1].matchLevel).toBe("SIMILAR");
  });

  it("слишком непохожий (≤4 совпадений) → отсеивается, не выдаём за «похоже»", () => {
    const weak = cand(fp({ connection: "DRAW", position: "BTN" })); // счёт 4
    expect(selectPriorSpots(current, [weak])).toHaveLength(0);
  });

  it("не больше трёх прошлых раздач в выдаче", () => {
    const many = [cand(fp()), cand(fp()), cand(fp()), cand(fp()), cand(fp())];
    expect(selectPriorSpots(current, many)).toHaveLength(3);
  });

  it("переносит данные раздачи (карты, что сделал, что сказал, результат)", () => {
    const c = cand(fp(), {
      cards: ["Kd", "7c"],
      decision: "олл-ин на префлопе",
      reasoning: "думал, что он блефует",
      chipResult: -1200,
      when: "12.06.2026",
    });
    const [spot] = selectPriorSpots(current, [c]);
    expect(spot).toMatchObject({
      cards: ["Kd", "7c"],
      decision: "олл-ин на префлопе",
      reasoning: "думал, что он блефует",
      chipResult: -1200,
      when: "12.06.2026",
      matchLevel: "EXACT",
    });
  });
});

import { describe, it, expect } from "vitest";
import type { TableAction, TableSnapshot } from "@/parser/types";
import {
  computeSpotFingerprint,
  spotKey,
  spotMatchScore,
} from "@/parser/spot-fingerprint";

const BB = 100;

function snap(opts: {
  position?: string;
  heroStack?: number;
  heroCards?: string[];
  board?: string[];
  actions?: TableAction[];
}): TableSnapshot {
  const position = opts.position ?? "BTN";
  const actions: TableAction[] = [
    { street: "PREFLOP", actor: "Player 2", action: "POST_BB", amount: BB },
    ...(opts.actions ?? []),
  ];
  return {
    seats: [{ label: "Hero", position, startingStack: opts.heroStack ?? 2000 }],
    heroCards: opts.heroCards ?? ["As", "Kd"],
    board: opts.board ?? [],
    actions,
  } as unknown as TableSnapshot;
}

describe("computeSpotFingerprint", () => {
  it("«три-флеш-доска без попадания» = монотонный борд + промах (пример Артёма)", () => {
    // Борд монотонный (три червы), у Hero ни одной червы и ни одной пары → голый промах.
    const fp = computeSpotFingerprint(
      snap({ heroCards: ["As", "Qc"], board: ["Kh", "8h", "3h"] }),
    );
    expect(fp.board?.suitedness).toBe("MONOTONE");
    expect(fp.connection).toBe("WHIFF");
  });

  it("монотонный борд, но У Hero есть карта масти → это дро, не промах", () => {
    const fp = computeSpotFingerprint(
      snap({ heroCards: ["Ah", "Qc"], board: ["Kh", "8h", "3h"] }),
    );
    expect(fp.connection).toBe("DRAW");
  });

  it("собранная сильная рука (две пары) → MADE_STRONG", () => {
    const fp = computeSpotFingerprint(
      snap({ heroCards: ["Kc", "8d"], board: ["Ks", "8h", "3c"] }),
    );
    expect(fp.connection).toBe("MADE_STRONG");
  });

  it("ровно пара → MADE_PAIR", () => {
    const fp = computeSpotFingerprint(
      snap({ heroCards: ["Kc", "9d"], board: ["Ks", "8h", "3c"] }),
    );
    expect(fp.connection).toBe("MADE_PAIR");
  });

  it("префлоп: борда нет → street PREFLOP, board null, connection NONE", () => {
    const fp = computeSpotFingerprint(snap({ board: [] }));
    expect(fp.street).toBe("PREFLOP");
    expect(fp.board).toBeNull();
    expect(fp.connection).toBe("NONE");
  });

  it("глубина стека по BB: ≤15 SHORT, 15–35 MID, >35 DEEP", () => {
    expect(computeSpotFingerprint(snap({ heroStack: 1000 })).stack).toBe("SHORT"); // 10 BB
    expect(computeSpotFingerprint(snap({ heroStack: 2000 })).stack).toBe("MID"); // 20 BB
    expect(computeSpotFingerprint(snap({ heroStack: 5000 })).stack).toBe("DEEP"); // 50 BB
  });

  it("роль префлопа: открыл / 3-бет / защита ББ", () => {
    const open = computeSpotFingerprint(
      snap({ actions: [{ street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 }] }),
    );
    expect(open.role).toBe("OPEN");

    const threeBet = computeSpotFingerprint(
      snap({
        actions: [
          { street: "PREFLOP", actor: "Player 3", action: "RAISE", amount: 250 },
          { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 750 },
        ],
      }),
    );
    expect(threeBet.role).toBe("3BET");

    const bbDef = computeSpotFingerprint(
      snap({
        position: "BB",
        actions: [
          { street: "PREFLOP", actor: "Player 3", action: "RAISE", amount: 250 },
          { street: "PREFLOP", actor: "Hero", action: "CALL", amount: 250 },
        ],
      }),
    );
    expect(bbDef.role).toBe("BBDEF");
  });
});

describe("spotKey / spotMatchScore — анти-галлюцинация", () => {
  const a = snap({ position: "BB", heroCards: ["As", "Qc"], board: ["Kh", "8h", "3h"] });

  it("одинаковая ситуация → одинаковый ключ", () => {
    const b = snap({ position: "BB", heroCards: ["Js", "4c"], board: ["Qh", "9h", "2h"] });
    // разные карты, но та же ситуация: BB, монотон, промах, та же глубина/улица/роль
    expect(spotKey(computeSpotFingerprint(a))).toBe(spotKey(computeSpotFingerprint(b)));
  });

  it("другая позиция → другой ключ (не выдаём за «то же»)", () => {
    const c = snap({ position: "BTN", heroCards: ["As", "Qc"], board: ["Kh", "8h", "3h"] });
    expect(spotKey(computeSpotFingerprint(a))).not.toBe(spotKey(computeSpotFingerprint(c)));
  });

  it("совсем непохожий спот → низкий счёт совпадения", () => {
    // a: BB, монотон-промах, постфлоп. d: BTN-опен на префлопе с сильной рукой.
    const d = snap({
      position: "BTN",
      heroCards: ["Ac", "Ad"],
      board: [],
      actions: [{ street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 }],
    });
    expect(spotMatchScore(computeSpotFingerprint(a), computeSpotFingerprint(d))).toBeLessThanOrEqual(2);
  });

  it("идентичный отпечаток → счёт 6 (полное совпадение, «один в один»)", () => {
    expect(spotMatchScore(computeSpotFingerprint(a), computeSpotFingerprint(a))).toBe(6);
  });
});

import { describe, it, expect } from "vitest";
import { boardDangerFacts, renderShowdownFacts } from "@/parser/facts";
import type { TableSnapshot } from "@/parser/types";

function snap(partial: Partial<TableSnapshot>): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions: [], potTotal: 0, ...partial };
}

describe("boardDangerFacts — фаза 4: опасность борда", () => {
  it("борд с трипсом: любая карманная пара уже фулл", () => {
    const lines = boardDangerFacts(["As", "Kd"], ["4c", "4h", "4s", "Qd"]);
    expect(lines.some((l) => l.includes("трипс") && l.includes("фулл-хаус"))).toBe(true);
  });

  it("спаренный борд: фулл-хаус в игре, и свой фулл младший (KK7 + 77)", () => {
    const lines = boardDangerFacts(["7c", "7d"], ["Kc", "Kh", "7s"]);
    expect(lines.some((l) => l.includes("спарена") && l.includes("фулл-хаус уже в игре"))).toBe(true);
    expect(lines.some((l) => l.includes("НЕ старший"))).toBe(true);
  });

  it("свой фулл СТАРШИЙ (KK7 + KK) — маркер младшего фулла не срабатывает", () => {
    // KK на KK7 — каре королей/фулл королей, не младший.
    const lines = boardDangerFacts(["Kd", "Ks"], ["Kc", "Kh", "7s"]);
    expect(lines.some((l) => l.includes("НЕ старший"))).toBe(false);
  });

  it("сухой неспаренный борд — маркеров нет", () => {
    expect(boardDangerFacts(["As", "Kd"], ["2c", "7h", "Td"])).toEqual([]);
  });

  it("до флопа — пусто", () => {
    expect(boardDangerFacts(["As", "Kd"], [])).toEqual([]);
  });
});

describe("renderShowdownFacts — фаза 4: вскрытые карты с комбинацией", () => {
  it("классифицирует руку вскрывшегося (JJ на борде с 99 → фулл-хаус)", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BTN", startingStack: 1000 },
        { label: "Player 6", position: "BB", startingStack: 1000, shownCards: ["Jh", "Jc"] },
      ],
      board: ["9d", "9s", "Jd", "2c", "5h"],
    });
    const out = renderShowdownFacts(s);
    expect(out).toContain("Player 6 вскрыл Jh Jc");
    expect(out).toContain("фулл-хаус");
    expect(out).toContain("НЕ гадай");
  });

  it("нет вскрытий → пусто", () => {
    const s = snap({
      seats: [{ label: "Hero", position: "BTN", startingStack: 1000 }],
      board: ["9d", "9s", "Jd"],
    });
    expect(renderShowdownFacts(s)).toBe("");
  });
});

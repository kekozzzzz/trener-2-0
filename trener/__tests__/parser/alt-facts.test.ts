import { describe, it, expect } from "vitest";
import type { TableSnapshot } from "@/parser/types";
import { renderAltFacts } from "@/parser/alt-facts";
import { renderCriticalReason } from "@/parser/decision-weight";
import { buildHandAnalysisPrompt } from "@/config/prompts/hand-analysis";
import type { HandAnalysisRequest } from "@/infrastructure/adapters/llm/types";

// Вплетение движка альтернатив + причина отбора (план 2026-07-11).

function bigFoldSnap(): TableSnapshot {
  return {
    seats: [
      { label: "Player 1", position: "BB", startingStack: 5000, seatNumber: 1 },
      { label: "Player 2", position: "SB", startingStack: 5000, seatNumber: 2 },
      { label: "Hero", position: "BTN", startingStack: 5000, seatNumber: 3 },
    ],
    heroCards: ["Qh", "Qd"],
    board: ["Kd", "2s", "6s", "2c", "Td"],
    actions: [
      { street: "PREFLOP", actor: "Player 2", action: "POST_SB", amount: 50 },
      { street: "PREFLOP", actor: "Player 1", action: "POST_BB", amount: 100 },
      { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 220 },
      { street: "PREFLOP", actor: "Player 2", action: "FOLD" },
      { street: "PREFLOP", actor: "Player 1", action: "CALL", amount: 120 },
      { street: "FLOP", actor: "Player 1", action: "BET", amount: 300 },
      { street: "FLOP", actor: "Hero", action: "CALL", amount: 300 },
      { street: "TURN", actor: "Player 1", action: "CHECK" },
      { street: "TURN", actor: "Hero", action: "CHECK" },
      { street: "RIVER", actor: "Player 1", action: "BET", amount: 900 },
      { street: "RIVER", actor: "Hero", action: "FOLD" },
    ],
    potTotal: 1090,
  };
}

describe("renderCriticalReason", () => {
  it("крупный фолд → блок причины с банком и ценой, без вердикта", () => {
    const text = renderCriticalReason(bigFoldSnap(), -520);
    expect(text).toContain("Почему эта раздача выбрана в разбор");
    expect(text).toContain("крупный фолд");
    expect(text).toContain("НЕ вердикт");
  });

  it("обычная потеря без каналов → причина «дорогая спорная потеря»", () => {
    const s = bigFoldSnap();
    // Убираем фолд и ривер: чистая потеря коллом без тяжёлого решения.
    s.actions = s.actions.slice(0, 7);
    s.board = ["Kd", "2s", "6s"];
    const text = renderCriticalReason(s, -520);
    expect(text).toContain("дорогая спорная потеря");
  });
});

describe("renderAltFacts", () => {
  it("раздача без спотов движка → пустая строка (не шумим)", () => {
    const s = bigFoldSnap();
    s.actions = s.actions.slice(0, 5); // только префлоп без веток
    s.board = [];
    expect(renderAltFacts(s)).toBe("");
  });

  it("блок веток начинается с инструкции «не вердикт» и содержит долю диапазона", () => {
    // Прочеканный ривер с двумя парами → упущенный велью-бет точно сработает.
    const s = bigFoldSnap();
    s.heroCards = ["Kh", "Jd"];
    s.board = ["Ad", "Kc", "2h", "7s", "Jh"];
    s.actions = [
      ...s.actions.slice(0, 5),
      { street: "FLOP", actor: "Player 1", action: "BET", amount: 600 },
      { street: "FLOP", actor: "Hero", action: "CALL", amount: 600 },
      { street: "TURN", actor: "Player 1", action: "CHECK" },
      { street: "TURN", actor: "Hero", action: "CHECK" },
      { street: "RIVER", actor: "Player 1", action: "CHECK" },
      { street: "RIVER", actor: "Hero", action: "CHECK" },
    ];
    const text = renderAltFacts(s);
    expect(text).toContain("не вердикт");
    expect(text).toContain("ДОЛЯ ДИАПАЗОНА");
    expect(text).toContain("Непройденная ветка");
  });
});

describe("buildHandAnalysisPrompt — причина отбора в промпте", () => {
  function request(importanceLevel: "CRITICAL" | "STRONG"): HandAnalysisRequest {
    return {
      tournament: { handsCount: 100, vpipPercent: 22, styleDiagnosis: "LOOSE" },
      importanceLevel,
      chipResult: -520,
      tableSnapshot: bigFoldSnap(),
      locale: "ru",
    } as HandAnalysisRequest;
  }

  it("критическая раздача-фолд получает блок «Почему эта раздача выбрана»", () => {
    const prompt = buildHandAnalysisPrompt(request("CRITICAL"));
    expect(prompt).toContain("Почему эта раздача выбрана в разбор");
    expect(prompt).toContain("крупный фолд");
  });

  it("некритическая раздача блока причины не получает", () => {
    const prompt = buildHandAnalysisPrompt(request("STRONG"));
    expect(prompt).not.toContain("Почему эта раздача выбрана в разбор");
  });
});

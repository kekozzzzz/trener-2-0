import { describe, it } from "vitest";
import fs from "fs";
import { parseGGPokerMtt } from "@/parser/ggpoker";
import { computeHandFacts, renderHandFacts } from "@/parser/facts";

// Переиспользуемый прогонщик: HH берём из файла в env HH_FILE, факты пишем рядом (.out).
// Запуск: HH_FILE=path npx vitest run __tests__/parser/_run-hand.test.ts
describe("run hand", () => {
  // Прогоняется только когда задан HH_FILE — иначе пропускаем, чтобы не ронять общий
  // прогон. Это вспомогательный инструмент для контента, не настоящий тест.
  it.runIf(!!process.env.HH_FILE)("парсит и пишет факты", () => {
    const file = process.env.HH_FILE!;
    const res = parseGGPokerMtt(fs.readFileSync(file));
    if (!res.ok) {
      fs.writeFileSync(file + ".out", "PARSE ERROR: " + res.error, "utf8");
      throw new Error("parse failed: " + res.error);
    }
    const t = res.data;
    const h = t.hands[0];
    const out = [
      "name: " + t.name + " | hands: " + t.handsCount,
      "heroCards: " + h.tableSnapshot.heroCards.join(" "),
      "board: " + h.tableSnapshot.board.join(" "),
      "chipResult: " + h.chipResult,
      "=== FACTS ===",
      JSON.stringify(computeHandFacts(h.tableSnapshot), null, 2),
      "=== render ===",
      renderHandFacts(h.tableSnapshot),
    ].join("\n");
    fs.writeFileSync(file + ".out", out, "utf8");
  });
});

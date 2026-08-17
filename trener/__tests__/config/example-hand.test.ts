// Проверка: изолированный текст EXAMPLE_HAND_RAW парсится тем же результатом, что и раздача
// #59 внутри полного турнирного файла — числа для /example не разъехались при вырезании.
import { it, expect } from "vitest";
import { parseHandHistory } from "@/parser";
import { detectHeroLuckyWin } from "@/parser/lucky-win";
import { tableStateUpTo } from "@/parser/table-state";
import { EXAMPLE_HAND_RAW, EXAMPLE_HAND_DECISION_INDEX } from "@/config/example-hand";

it("EXAMPLE_HAND_RAW парсится и совпадает с ожидаемыми числами", () => {
  const parsed = parseHandHistory(Buffer.from(EXAMPLE_HAND_RAW));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return;
  const h = parsed.data.hands[0];
  expect(h.chipResult).toBe(14398);
  const lucky = detectHeroLuckyWin(h.tableSnapshot);
  expect(lucky).toEqual({ street: "FLOP", equityPct: 18.5 });
  const action = h.tableSnapshot.actions[EXAMPLE_HAND_DECISION_INDEX];
  expect(action.actor).toBe("Hero");
  expect(action.action).toBe("BET");
  expect(action.amount).toBe(11100);
  const table = tableStateUpTo(h.tableSnapshot, EXAMPLE_HAND_DECISION_INDEX);
  expect(table.street).toBe("FLOP");
  expect(table.decisionActor).toBe("Hero");
  console.log(JSON.stringify({ potSoFar: table.potSoFar, board: table.board }, null, 2));
});

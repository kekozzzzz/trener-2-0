// Эталонный набор обязан парситься боевым роутером — без этого прогон через модель бессмыслен
// (план 2026-08-08, фаза 1). Тест дешёвый, LLM не трогает, поэтому идёт в обычный набор: если
// правка парсера сломает разбор эталонных раздач, это видно сразу, а не на прогоне за деньги.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseHandHistory } from "@/parser";
import { renderHandFacts } from "@/parser/facts";

const ROOMS = ["gg", "ipoker"] as const;
const DIR = path.join(__dirname, "..", "fixtures", "regression-benchmark");

describe("эталонный набор регресс-раздач", () => {
  for (const room of ROOMS) {
    const files = fs.readdirSync(path.join(DIR, room)).filter((f) => /\.(txt|xml)$/i.test(f)).sort();

    it(`${room}: все 30 файлов на месте`, () => {
      expect(files.length).toBe(30);
    });

    it(`${room}: каждый файл распознаётся парсером и даёт раздачу с картами Hero`, () => {
      const broken: string[] = [];
      for (const f of files) {
        const parsed = parseHandHistory(fs.readFileSync(path.join(DIR, room, f)));
        if (!parsed.ok) {
          broken.push(`${f}: не распознан`);
          continue;
        }
        const hand = parsed.data.hands[0];
        if (!hand) broken.push(`${f}: раздач ноль`);
        else if (hand.tableSnapshot.heroCards.length !== 2) broken.push(`${f}: карт Hero ${hand.tableSnapshot.heroCards.length}`);
      }
      expect(broken).toEqual([]);
    });

    it(`${room}: факты парсера строятся без падений и не пусты`, () => {
      const broken: string[] = [];
      for (const f of files) {
        const parsed = parseHandHistory(fs.readFileSync(path.join(DIR, room, f)));
        if (!parsed.ok || !parsed.data.hands[0]) continue;
        try {
          const facts = renderHandFacts(parsed.data.hands[0].tableSnapshot);
          if (!facts.trim()) broken.push(`${f}: факты пустые`);
        } catch (e) {
          broken.push(`${f}: ${(e as Error).message}`);
        }
      }
      expect(broken).toEqual([]);
    });
  }
});

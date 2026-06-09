import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseGGPokerMtt } from "@/parser/ggpoker";

const rcBuffer = fs.readFileSync(path.join(__dirname, "../fixtures/sample_mtt.txt"));
const tmBuffer = fs.readFileSync(path.join(__dirname, "../fixtures/tm_mtt.txt"));

describe("parseGGPokerMtt", () => {
  it("парсит RC-GGPoker формат", () => {
    const result = parseGGPokerMtt(rcBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.handsCount).toBe(3);
    expect(result.data.vpipPercent).toBe(66.67);
  });

  it("парсит TM формат (реальный GGPoker MTT)", () => {
    const result = parseGGPokerMtt(tmBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.handsCount).toBe(3);
    expect(result.data.vpipPercent).toBe(66.67);
  });

  it("отклоняет неподдерживаемый формат", () => {
    const result = parseGGPokerMtt(Buffer.from("PokerStars Hand #12345: Hold'em No Limit"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.type).toBe("UNSUPPORTED_FORMAT");
  });
});

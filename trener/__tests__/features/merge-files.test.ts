import { describe, it, expect } from "vitest";
import { mergeSameTournamentFiles } from "@/features/tournaments/merge-files";
import { parseWpnMtt } from "@/parser/wpn";

// Два стола одного WPN-турнира #999: при балансировке игрока пересадили. Должны
// склеиться в ОДИН файл и разобраться как один турнир со всеми раздачами.
const tableA = Buffer.from(
  `Game Hand #1 - Tournament #999 - Holdem (No Limit) - Level 1 (10/20) - 2026/01/01 12:00:00 UTC
Table '1' 6-max Seat #1 is the button
Seat 1: Villain A (1000)
Seat 2: hero99 (1000)
Villain A posts ante 5
hero99 posts ante 5
Villain A posts the small blind 10
hero99 posts the big blind 20
*** HOLE CARDS ***
Dealt to hero99 [2c 7d]
Villain A folds
hero99 does not show
*** SUMMARY ***
Total pot 35
Seat 1: Villain A (button) folded on the Pre-Flop
Seat 2: hero99 (big blind) did not show and won 35
`,
);

const tableB = Buffer.from(
  `Game Hand #50 - Tournament #999 - Holdem (No Limit) - Level 8 (100/200) - 2026/01/01 13:30:00 UTC
Table '2' 6-max Seat #2 is the button
Seat 1: New Guy (5000)
Seat 2: hero99 (8000)
New Guy posts ante 25
hero99 posts ante 25
hero99 posts the small blind 100
New Guy posts the big blind 200
*** HOLE CARDS ***
Dealt to hero99 [As Ks]
hero99 raises 400 to 400
New Guy folds
Uncalled bet (200) returned to hero99
hero99 collected 450 from pot
*** SUMMARY ***
Total pot 450
Seat 1: New Guy (big blind) folded on the Pre-Flop
Seat 2: hero99 (small blind) did not show and won 450
`,
);

describe("mergeSameTournamentFiles — склейка многостольных файлов одного турнира", () => {
  it("два стола одного турнира → один файл; чужой файл остаётся отдельно", () => {
    const merged = mergeSameTournamentFiles([
      { fileBuffer: tableA, originalFilename: "t999_table1.txt" },
      { fileBuffer: tableB, originalFilename: "t999_table2.txt" },
      { fileBuffer: Buffer.from("случайный не-покерный текст"), originalFilename: "junk.txt" },
    ]);
    // группа #999 (2 файла) → 1, мусор без ключа → отдельно
    expect(merged.length).toBe(2);
  });

  it("склеенный турнир парсится как один со всеми раздачами обоих столов", () => {
    const merged = mergeSameTournamentFiles([
      { fileBuffer: tableB, originalFilename: "later.txt" }, // намеренно в обратном порядке
      { fileBuffer: tableA, originalFilename: "earlier.txt" },
    ]);
    expect(merged.length).toBe(1);

    const result = parseWpnMtt(merged[0].fileBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.externalTournamentId).toBe("999");
    expect(result.data.handsCount).toBe(2); // обе раздачи, из двух файлов
    // playedAt — самая ранняя раздача (стол 1, 12:00), несмотря на порядок склейки
    expect(result.data.playedAt).toBe("2026-01-01T12:00:00.000Z");
  });

  it("случайный повтор того же файла не удваивает раздачи (дедуп по номеру раздачи)", () => {
    const merged = mergeSameTournamentFiles([
      { fileBuffer: tableA, originalFilename: "a.txt" },
      { fileBuffer: tableA, originalFilename: "a-копия.txt" },
    ]);
    expect(merged.length).toBe(1); // тот же турнир → склеены
    const result = parseWpnMtt(merged[0].fileBuffer);
    if (!result.ok) return;
    expect(result.data.handsCount).toBe(1); // раздача #1 одна, не две
  });

  it("один файл проходит без изменений", () => {
    const merged = mergeSameTournamentFiles([{ fileBuffer: tableA, originalFilename: "solo.txt" }]);
    expect(merged.length).toBe(1);
    expect(merged[0].originalFilename).toBe("solo.txt");
  });
});

/**
 * Разметка улиц в строке борда (правка 2026-07-16).
 * Зачем: борд отдавался плоским списком («Jc 5d Js Th 2d») — какая карта пришла на тёрне, а какая
 * на ривере, модель выводила счётом и мазала. Аудит 16.07 поймал дословно: «на тёрне 10♣… на
 * ривере 5♦» при реальном тёрне 5♦. Теперь улицы размечает код.
 */
import { describe, it, expect } from "vitest";
import { renderTableSnapshot } from "@/config/prompts/hand-analysis";
import type { TableSnapshot } from "@/parser/types";

function snap(board: string[]): TableSnapshot {
  return { seats: [], heroCards: ["Ah", "Kd"], board, actions: [], potTotal: 0 };
}
const boardLine = (s: TableSnapshot, locale: "ru" | "en" = "ru") =>
  renderTableSnapshot(s, locale).split("\n").find((l) => l.startsWith(locale === "ru" ? "Борд" : "Board"))!;

describe("борд с разметкой улиц", () => {
  it("полный борд: флоп | тёрн | ривер", () => {
    const line = boardLine(snap(["Jc", "5d", "Js", "Th", "2d"]));
    expect(line).toContain("флоп Jc 5d Js");
    expect(line).toContain("тёрн Th");
    expect(line).toContain("ривер 2d");
  });

  it("только флоп — тёрна и ривера в строке нет", () => {
    const line = boardLine(snap(["Jc", "5d", "Js"]));
    expect(line).toContain("флоп Jc 5d Js");
    expect(line).not.toContain("тёрн");
    expect(line).not.toContain("ривер");
  });

  it("флоп+тёрн — ривера нет", () => {
    const line = boardLine(snap(["Jc", "5d", "Js", "Th"]));
    expect(line).toContain("тёрн Th");
    expect(line).not.toContain("ривер");
  });

  it("карты и их порядок не меняются — сверка «каждая карта из строки Борд» продолжает работать", () => {
    const line = boardLine(snap(["Jc", "5d", "Js", "Th", "2d"]));
    for (const c of ["Jc", "5d", "Js", "Th", "2d"]) expect(line).toContain(c);
  });

  it("до флопа не дошло", () => {
    expect(boardLine(snap([]))).toContain("не дошло до флопа");
  });

  it("английская локаль размечена так же", () => {
    const line = boardLine(snap(["Jc", "5d", "Js", "Th", "2d"]), "en");
    expect(line).toContain("flop Jc 5d Js");
    expect(line).toContain("turn Th");
    expect(line).toContain("river 2d");
  });
});

/**
 * Позиция «OTHER» больше не уезжает в промпт (правка 2026-07-17).
 * Было: `Player 4 (OTHER, стек …)` — единственное английское слово в русском блоке. Модель
 * повторяла его игроку, и латинский сторож бракова́л ВЕСЬ разбор (аудит 16.07: «OTHER», «OTH»),
 * а промпт при этом трижды просил его не писать — то есть сам же и подсказывал.
 */
describe("неопределённая позиция — по-человечески, без OTHER", () => {
  const seatSnap = (position: "OTHER" | "BTN", positionName?: string): TableSnapshot => ({
    seats: [{ label: "Player 4", position, positionName, startingStack: 1000 }],
    heroCards: ["Ah", "Kd"],
    board: [],
    actions: [],
    potTotal: 0,
  });
  const seatsLine = (s: TableSnapshot, locale: "ru" | "en" = "ru") =>
    renderTableSnapshot(s, locale).split("\n").find((l) => l.startsWith(locale === "ru" ? "Места" : "Seats"))!;

  it("OTHER → «позиция не определена», самого слова в промпте нет", () => {
    const line = seatsLine(seatSnap("OTHER"));
    expect(line).toContain("позиция не определена");
    expect(line).not.toContain("OTHER");
  });

  it("английская локаль — position undetermined", () => {
    const line = seatsLine(seatSnap("OTHER"), "en");
    expect(line).toContain("position undetermined");
    expect(line).not.toContain("OTHER");
  });

  it("обычная позиция не тронута", () => {
    expect(seatsLine(seatSnap("BTN"))).toContain("BTN");
  });

  it("точное имя места (positionName) имеет приоритет", () => {
    expect(seatsLine(seatSnap("OTHER", "UTG+1"))).toContain("UTG+1");
  });
});

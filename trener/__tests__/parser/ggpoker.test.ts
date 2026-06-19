import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseGGPokerMtt } from "@/parser/ggpoker";

const rcBuffer = fs.readFileSync(path.join(__dirname, "../fixtures/sample_mtt.txt"));
const tmBuffer = fs.readFileSync(path.join(__dirname, "../fixtures/tm_mtt.txt"));
const richBuffer = fs.readFileSync(path.join(__dirname, "../fixtures/ggpoker_mtt_rich.txt"));

// Реальные никнеймы игроков из фикстуры ggpoker_mtt_rich.txt — не должны попасть в снимок (обезличивание)
const REAL_NICKNAMES = [
  "97ed8581",
  "a946d168",
  "9346c960",
  "6545ec0a",
  "b4e33b86",
  "57dabc08",
  "45b1640a",
  "311884c4",
];

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

  it("извлекает метаданные турнира из заголовка (номер, название, дата, площадка)", () => {
    const result = parseGGPokerMtt(richBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room).toBe("GGPoker");
    expect(result.data.externalTournamentId).toBe("289598162");
    expect(result.data.name).toBe("Bounty Hunters Deepstack Turbo $5.40 Hold'em No Limit");
    // Самая ранняя раздача файла (файл идёт от свежих к старым), момент в UTC.
    expect(result.data.playedAt).toBe("2026-06-11T20:09:30.000Z");
  });

  it("извлекает метаданные для RC-формата", () => {
    const result = parseGGPokerMtt(rcBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.externalTournamentId).toBe("12345678");
    expect(result.data.name).toBe("$1+$0.10 NL Hold'em");
  });
});

describe("снимок раздачи (hands[])", () => {
  const result = parseGGPokerMtt(richBuffer);
  if (!result.ok) throw new Error("фикстура ggpoker_mtt_rich.txt не распарсилась");
  const { hands } = result.data;

  it("разбирает каждую раздачу с Hero", () => {
    expect(result.data.handsCount).toBe(6);
    expect(hands).toHaveLength(6);
    expect(result.data.vpipPercent).toBe(83.33);
  });

  it("считает PFR и стилевой диагноз", () => {
    expect(result.data.pfrPercent).toBe(66.67);
    expect(result.data.styleDiagnosis).toBe("LOOSE");
  });

  it("размечает раздачи по важности: спорные минусы — критические, спорный плюс — сильная", () => {
    expect(hands.map((h) => h.importanceLevel)).toEqual([
      "CRITICAL", // TM6064778428: олл-ин над коллерами, -51807
      "CRITICAL", // TM6064778413: колл рейза, фолд на флопе, -4400
      "MEDIUM", // TM6064778399: открытие в пустоту, фолд на флопе
      "MEDIUM", // TM6064778368: фолд префлоп без чужого вложения
      "MEDIUM", // TM6064778283: открытие в пустоту, выигрыш без вскрытия
      "STRONG", // TM6064778230: ре-рейз олл-ин над чужим шоувом, +26762
    ]);
  });

  it("обезличивает игроков — реальные никнеймы не попадают в снимок", () => {
    const json = JSON.stringify(hands);
    for (const nickname of REAL_NICKNAMES) {
      expect(json).not.toContain(nickname);
    }
  });

  it("разбирает раздачу с олл-ин клэшем и полным разворотом борда (TM6064778428)", () => {
    const hand = hands[0];
    expect(hand.chipResult).toBe(-51807);
    expect(hand.tableSnapshot.heroCards).toEqual(["8h", "Ac"]);
    expect(hand.tableSnapshot.board).toEqual(["Jh", "Ks", "4h", "4s", "5c"]);
    expect(hand.tableSnapshot.potTotal).toBe(111414);
    expect(hand.tableSnapshot.seats).toHaveLength(8);

    const hero = hand.tableSnapshot.seats.find((s) => s.label === "Hero");
    expect(hero?.position).toBe("SB");
    expect(hero?.startingStack).toBe(51807);

    const button = hand.tableSnapshot.seats.find((s) => s.position === "BTN");
    expect(button?.label).toBe("Player 3");
    const bb = hand.tableSnapshot.seats.find((s) => s.position === "BB");
    expect(bb?.label).toBe("Player 5");

    const heroAllIn = hand.tableSnapshot.actions.find(
      (a) => a.actor === "Hero" && a.action === "ALL_IN",
    );
    expect(heroAllIn?.amount).toBe(51507);
    expect(heroAllIn?.street).toBe("PREFLOP");
  });

  it("разбирает раздачу с фолдом на флопе (TM6064778413)", () => {
    const hand = hands[1];
    expect(hand.chipResult).toBe(-4400);
    expect(hand.tableSnapshot.heroCards).toEqual(["8d", "Qd"]);

    const hero = hand.tableSnapshot.seats.find((s) => s.label === "Hero");
    expect(hero?.position).toBe("BB");

    const heroFold = hand.tableSnapshot.actions.find(
      (a) => a.actor === "Hero" && a.action === "FOLD",
    );
    expect(heroFold?.street).toBe("FLOP");
  });

  it("разбирает раздачу со сайд-потом, где Hero сбрасывает префлоп (TM6064778368)", () => {
    const hand = hands[3];
    expect(hand.chipResult).toBe(-200);
    expect(hand.tableSnapshot.board).toEqual(["3d", "Ad", "7s", "3c", "Th"]);
    expect(hand.tableSnapshot.potTotal).toBe(44870);
  });

  it("разбирает раздачу, выигранную без вскрытия (TM6064778283)", () => {
    const hand = hands[4];
    expect(hand.chipResult).toBe(3060);
    expect(hand.tableSnapshot.board).toEqual([]);
    expect(hand.tableSnapshot.potTotal).toBe(4440);
  });

  it("разбирает раздачу с непоследовательными местами за столом (TM6064778230)", () => {
    const hand = hands[5];
    expect(hand.chipResult).toBe(26762);
    expect(hand.tableSnapshot.seats).toHaveLength(7);
    expect(hand.tableSnapshot.seats.find((s) => s.label === "Player 1")).toBeUndefined();

    const button = hand.tableSnapshot.seats.find((s) => s.position === "BTN");
    expect(button?.label).toBe("Player 6");
    const sb = hand.tableSnapshot.seats.find((s) => s.position === "SB");
    expect(sb?.label).toBe("Player 7");
    const bb = hand.tableSnapshot.seats.find((s) => s.position === "BB");
    expect(bb?.label).toBe("Player 8");

    // Позиция считается по кольцу занятых мест от баттона: Hero — HJ (за два места до баттона).
    const hero = hand.tableSnapshot.seats.find((s) => s.label === "Hero");
    expect(hero?.position).toBe("HJ");

    // CO — место прямо перед баттоном, ранние места — EARLY.
    expect(hand.tableSnapshot.seats.find((s) => s.position === "CO")?.label).toBe("Player 5");
    expect(hand.tableSnapshot.seats.filter((s) => s.position === "EARLY")).toHaveLength(2);
  });
});

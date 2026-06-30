import { describe, it, expect } from "vitest";
import type { ParsedHand, ParsedTournament, ParseResult } from "@/parser/types";
import { diagnoseParse, isProbablyText } from "@/parser/diagnose";

const buf = Buffer.from("PokerStars Hand #1: Tournament #1, $5+$0.5 USD Hold'em No Limit - Level I\nTable '1 2'");

function hand(over: Partial<ParsedHand["tableSnapshot"]> = {}): ParsedHand {
  return {
    chipResult: 0,
    importanceLevel: "MEDIUM",
    tableSnapshot: {
      seats: [{ label: "Hero", position: "BTN", startingStack: 1000, seatNumber: 1 }],
      heroCards: ["Ah", "Kd"],
      board: [],
      actions: [{ street: "PREFLOP", actor: "Hero", action: "FOLD" }],
      potTotal: 0,
      ...over,
    },
  };
}

function ok(over: Partial<ParsedTournament> = {}): ParseResult {
  return {
    ok: true,
    data: {
      room: "PokerStars",
      externalTournamentId: "1",
      name: "Test",
      playedAt: "2024-03-25T16:00:00.000Z",
      handsCount: 2,
      vpipPercent: 25,
      pfrPercent: 18,
      postflopAggressionFactor: 2,
      resultBuyins: 0,
      styleDiagnosis: "TIGHT",
      hands: [hand(), hand()],
      ...over,
    },
  };
}

// Есть ли в строке управляющий символ (код < 0x20 или 0x7F) — без regex-литералов.
function hasControlChar(s: string): boolean {
  for (const ch of s) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

describe("diagnoseParse — сторож разбора", () => {
  it("здоровый разбор → нет тревоги", () => {
    expect(diagnoseParse(ok(), buf)).toBeNull();
  });

  it("нераспознанный ТЕКСТовый формат → тревога про новый рум, storable=true", () => {
    const r = diagnoseParse({ ok: false, error: { type: "UNSUPPORTED_FORMAT", message: "x" } }, buf);
    expect(r?.reason).toContain("новый рум");
    expect(r?.signature).toContain("PokerStars Hand #1");
    expect(r?.storable).toBe(true);
  });

  it("бинарь под видом файла → не сохраняем (storable=false), помечен нечитаемым", () => {
    const binary = Buffer.from([0x4d, 0x5a, 0x00, 0x01, 0x02, 0x00, 0xff, 0xfe, 0x00, 0x03]);
    const r = diagnoseParse({ ok: false, error: { type: "UNSUPPORTED_FORMAT", message: "x" } }, binary);
    expect(r?.storable).toBe(false);
    expect(r?.reason).toContain("не похож на текст");
  });

  it("isProbablyText: текст да, NUL-байт нет; UTF-8 (€) — текст", () => {
    expect(isProbablyText(Buffer.from("Seat 1: Ник (1000) 9€"))).toBe(true);
    expect(isProbablyText(Buffer.from([0x00, 0x01, 0x02, 0x03]))).toBe(false);
    expect(isProbablyText(Buffer.from(""))).toBe(false);
  });

  it("сигнатура чистится от управляющих символов", () => {
    const dirty = Buffer.from("\x07PokerStars Hand\x09 #1: бла\x1b[31m");
    const r = diagnoseParse({ ok: false, error: { type: "UNSUPPORTED_FORMAT", message: "x" } }, dirty);
    expect(hasControlChar(r?.signature ?? "")).toBe(false);
    expect(r?.signature).toContain("PokerStars Hand");
  });

  it("рум распознан, но разбор сорвался → тревога", () => {
    const r = diagnoseParse({ ok: false, error: { type: "PARSE_FAILED", message: "нет героя" } }, buf);
    expect(r?.reason).toContain("разбор сорвался");
  });

  it("PFR>VPIP (невозможно) → тревога", () => {
    expect(diagnoseParse(ok({ vpipPercent: 20, pfrPercent: 30 }), buf)?.reason).toContain("PFR>VPIP");
  });

  it("у большинства раздач нет действий → тревога (грамматика не подошла)", () => {
    const r = diagnoseParse(ok({ hands: [hand({ actions: [] }), hand({ actions: [] })] }), buf);
    expect(r?.reason).toContain("нет действий");
  });

  it("битые карты → тревога", () => {
    expect(diagnoseParse(ok({ hands: [hand({ board: ["XX", "7c"] })] }), buf)?.reason).toContain("битые карты");
  });

  it("подозрительная дата → тревога", () => {
    expect(diagnoseParse(ok({ playedAt: "1999-01-01T00:00:00.000Z" }), buf)?.reason).toContain("дата");
  });

  it("места не распознаны → тревога", () => {
    expect(diagnoseParse(ok({ hands: [hand({ seats: [] })] }), buf)?.reason).toContain("нет мест");
  });
});

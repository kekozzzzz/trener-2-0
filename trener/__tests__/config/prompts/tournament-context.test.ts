/**
 * Контекст турнира без провокаций (правка 2026-07-17).
 * Было: «VPIP 28%, стиль игрока — PASSIVE» — служебная аббревиатура + АНГЛИЙСКОЕ слово прямо в
 * промпте (styleDiagnosis это тип PlayerStyle). Модель копировала их игроку, и наш же латинский
 * сторож бракfoвал весь разбор (аудит 16.07: «VPIP», «CRITICAL», «PASSIVE» среди браков).
 * Правило проекта: не примешивать в промпт само запрещённое слово — упоминание провоцирует.
 */
import { describe, it, expect } from "vitest";
import { renderTournamentContext } from "@/config/prompts/hand-analysis";
import type { TournamentContext } from "@/infrastructure/adapters/llm/types";
import type { PlayerStyle } from "@/parser/types";

const ctx = (styleDiagnosis: PlayerStyle, extra: Partial<TournamentContext> = {}): TournamentContext => ({
  handsCount: 182,
  vpipPercent: 28,
  resultBuyins: -1,
  styleDiagnosis,
  ...extra,
});

describe("контекст турнира: ни VPIP, ни английских ярлыков", () => {
  it.each(["LOOSE", "TIGHT", "PASSIVE", "AGGRESSIVE"] as const)("стиль %s подан по-русски", (style) => {
    const out = renderTournamentContext(ctx(style), "ru");
    expect(out).not.toContain("VPIP");
    expect(out).not.toMatch(/LOOSE|TIGHT|PASSIVE|AGGRESSIVE/);
    expect(out).toMatch(/[а-я]/); // человеческое описание есть
  });

  it("число VPIP сохранено — смысл для модели не потерян, ушла только аббревиатура", () => {
    expect(renderTournamentContext(ctx("LOOSE"), "ru")).toContain("28%");
    expect(renderTournamentContext(ctx("LOOSE"), "ru")).toContain("182");
  });

  it("баунти-факт приезжает вместе с контекстом", () => {
    const out = renderTournamentContext(ctx("TIGHT", { isBounty: true }), "ru");
    expect(out).toContain("НОКАУТ");
  });

  it("английская локаль — без русских слов и без VPIP", () => {
    const out = renderTournamentContext(ctx("PASSIVE"), "en");
    expect(out).not.toContain("VPIP");
    expect(out).toContain("calls more often");
  });
});

/**
 * Дневник тренера (память об игроке, фаза 2):
 *  - pruneCoachNotes: протухание — 90 дней ИЛИ 1000 турниров назад, что раньше
 *    (требование Артёма 2026-07-06: старьё в памяти хуже беспамятства);
 *  - mergeCoachNotes: даты ставит код — basedOn сохраняет дату первого появления,
 *    новые заметки получают день занятия; потолок COACH_NOTES_MAX;
 *  - validateCoachNotes: кривые элементы выбывают поштучно, тексты чистятся словарём;
 *  - renderPlayerCard: заметки с датами в блоке «Твой ученик».
 * План: plans/2026-07-06-память-тренера-об-игроке.md.
 */

import { describe, it, expect } from "vitest";
import { mergeCoachNotes, pruneCoachNotes, type CoachNote } from "@/features/memory/coach-notes";
import { validateCoachNotes } from "@/infrastructure/adapters/llm/parse";
import { renderPlayerCard } from "@/config/prompts/player-card";
import { COACH_NOTES_MAX } from "@/config/memory";
import type { PlayerCard } from "@/infrastructure/adapters/llm/types";

const note = (date: string, text: string, counted = 100): CoachNote => ({ date, text, tournamentsCounted: counted });

describe("pruneCoachNotes — протухание", () => {
  it("старше 90 дней — выбывает, свежая — остаётся", () => {
    const notes = [note("2026-03-01", "старьё"), note("2026-06-20", "свежак")];
    const alive = pruneCoachNotes(notes, "2026-07-06", 100);
    expect(alive.map((n) => n.text)).toEqual(["свежак"]);
  });

  it("дальше 1000 турниров назад — выбывает, даже если по дате свежая", () => {
    const notes = [note("2026-07-01", "грайндер наиграл", 100), note("2026-07-01", "недавняя", 900)];
    const alive = pruneCoachNotes(notes, "2026-07-06", 1500);
    expect(alive.map((n) => n.text)).toEqual(["недавняя"]);
  });

  it("мусор без даты/текста выбывает", () => {
    const notes = [note("кривая-дата", "текст"), { date: "2026-07-01", text: "", tournamentsCounted: 0 }, note("2026-07-01", "ок", 0)];
    expect(pruneCoachNotes(notes, "2026-07-06", 10).map((n) => n.text)).toEqual(["ок"]);
  });
});

describe("mergeCoachNotes — даты ставит код", () => {
  const existing = [note("2026-05-01", "первая", 40), note("2026-06-01", "вторая", 60)];

  it("basedOn сохраняет дату и счётчик первого появления, новая получает день занятия", () => {
    const merged = mergeCoachNotes(
      existing,
      { notes: [{ text: "вторая уточнённая", basedOn: 2 }, { text: "новая" }] },
      "2026-07-06",
      120,
    );
    expect(merged).toEqual([
      { date: "2026-06-01", text: "вторая уточнённая", tournamentsCounted: 60 },
      { date: "2026-07-06", text: "новая", tournamentsCounted: 120 },
    ]);
  });

  it("потолок заметок соблюдается, пустые тексты выбывают", () => {
    const many = { notes: Array.from({ length: 20 }, (_, i) => ({ text: i === 0 ? "  " : `заметка ${i}` })) };
    const merged = mergeCoachNotes([], many, "2026-07-06", 10);
    expect(merged.length).toBe(COACH_NOTES_MAX);
    expect(merged[0].text).toBe("заметка 1");
  });
});

describe("validateCoachNotes", () => {
  it("кривые элементы выбывают поштучно, basedOn валидируется", () => {
    const result = validateCoachNotes({
      notes: [
        { text: "нормальная", basedOn: 2 },
        { text: "" },
        { basedOn: 1 },
        { text: "без ссылки", basedOn: 0 },
        "мусор",
      ],
    });
    expect(result.notes).toEqual([
      { text: "нормальная", basedOn: 2 },
      { text: "без ссылки", basedOn: undefined },
    ]);
  });

  it("без массива notes — ошибка", () => {
    expect(() => validateCoachNotes({})).toThrow();
  });
});

describe("заметки в карточке ученика", () => {
  it("рендерятся с датой дд.мм и инструкцией ссылаться", () => {
    const card: PlayerCard = {
      characteristic: null,
      tournamentsCounted: 5,
      leaks: [],
      notes: [{ date: "2026-06-28", text: "Договорились фолдить колл 3-бета вне позиции." }],
    };
    const block = renderPlayerCard(card);
    expect(block).toContain("28.06: Договорились фолдить");
    expect(block).toContain("заметки с прошлых занятий");
    expect(block).toContain("напомни договорённость с датой");
  });
});

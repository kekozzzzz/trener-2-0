import {
  COACH_NOTES_MAX,
  COACH_NOTE_MAX_AGE_DAYS,
  COACH_NOTE_MAX_TOURNAMENTS_BACK,
} from "@/config/memory";
import type { CoachNotesResult } from "@/infrastructure/adapters/llm/types";

// Дневник тренера об игроке — чистые функции протухания и слияния (покрыты тестами).
// План 2026-07-06-память-тренера-об-игроке, фаза 2. Хранится в player_profiles.coach_notes.
//
// Даты и возраст заметок считает КОД, не модель: LLM возвращает только тексты и ссылку
// basedOn на прежнюю заметку — дата первого появления наблюдения сохраняется, у новых
// заметок дата = день занятия. Протухание двойное (требование Артёма): 90 дней ИЛИ
// 1000 турниров назад — что наступит раньше.

export type CoachNote = {
  date: string; // YYYY-MM-DD — день, когда наблюдение появилось
  text: string;
  tournamentsCounted: number; // счётчик турниров игрока на момент появления заметки
};

// Содержимое player_profiles.coach_notes.
export type StoredCoachNotes = {
  notes: CoachNote[];
  seenDialogues: string[]; // учтённые диалоги (идемпотентность шага обновления)
};

function ageDays(date: string, today: string): number {
  const ms = Date.parse(today) - Date.parse(date);
  return Number.isFinite(ms) ? Math.floor(ms / 86_400_000) : Number.POSITIVE_INFINITY;
}

// Отрезает протухшие заметки: старше COACH_NOTE_MAX_AGE_DAYS дней ИЛИ дальше
// COACH_NOTE_MAX_TOURNAMENTS_BACK турниров назад. Кривые записи (без даты/текста)
// тоже выбывают — защита от мусора в JSON.
export function pruneCoachNotes(notes: CoachNote[], today: string, tournamentsCounted: number): CoachNote[] {
  return notes.filter(
    (n) =>
      typeof n?.text === "string" &&
      n.text.trim().length > 0 &&
      typeof n?.date === "string" &&
      ageDays(n.date, today) <= COACH_NOTE_MAX_AGE_DAYS &&
      tournamentsCounted - (n.tournamentsCounted ?? 0) <= COACH_NOTE_MAX_TOURNAMENTS_BACK,
  );
}

// Слияние ответа модели с прежними заметками: basedOn — номер прежней заметки (как она
// была пронумерована в промпте, с 1) — наблюдение продолжается, дата и счётчик турниров
// первого появления сохраняются; без basedOn — новая заметка с датой занятия.
export function mergeCoachNotes(
  existing: CoachNote[],
  result: CoachNotesResult,
  today: string,
  tournamentsCounted: number,
): CoachNote[] {
  const merged: CoachNote[] = [];
  for (const n of result.notes) {
    const text = n.text.trim();
    if (!text) continue;
    const base = n.basedOn != null ? existing[n.basedOn - 1] : undefined;
    merged.push({
      date: base?.date ?? today,
      text,
      tournamentsCounted: base?.tournamentsCounted ?? tournamentsCounted,
    });
    if (merged.length >= COACH_NOTES_MAX) break;
  }
  return merged;
}

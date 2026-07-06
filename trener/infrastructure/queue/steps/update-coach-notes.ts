import { Prisma } from "@prisma/client";
import type { StepHandler } from "../types";
import type { CoachNotesRequest } from "@/infrastructure/adapters/llm/types";
import { getLlmAdapter } from "@/infrastructure/adapters/llm";
import { getPlayerCard, invalidatePlayerCardCache } from "@/features/memory/player-card";
import { mergeCoachNotes, pruneCoachNotes, type StoredCoachNotes } from "@/features/memory/coach-notes";
import { gameDayKey } from "@/features/profile/leak-trend";
import { COACH_NOTES_MAX, COACH_NOTES_SEEN_DIALOGUES } from "@/config/memory";
import { safeNotifyAdmin } from "@/infrastructure/adapters/notify";

type UpdateCoachNotesPayload = {
  handId: string; // диалог ищем по раздаче (dialogue.handId уникален)
};

// Шаг «дневник тренера»: после пройденного диалога (вердикт сохранён) тренер обновляет
// личные заметки об ученике — качественные наблюдения с датами, которые потом идут в
// карточку ученика во всех ролях. План 2026-07-06-память-тренера-об-игроке, фаза 2.
//
// Правило 1: даты, протухание (90 дней / 1000 турниров) и слияние — код
// (features/memory/coach-notes.ts), модель работает только с текстами.
// Идемпотентность: учтённые диалоги помним в coach_notes.seenDialogues — повтор задачи
// после крэша не даёт второго платного вызова по тому же занятию.
export const updateCoachNotesStep: StepHandler = async (task, db) => {
  const { handId } = task.payload as UpdateCoachNotesPayload;

  const dialogue = await db.dialogue.findUnique({
    where: { handId },
    include: {
      hand: { include: { tournament: true } },
      rounds: { orderBy: { roundNumber: "asc" } },
    },
  });

  if (!dialogue || dialogue.hand.tournament.deletedAt) return; // удалено до воркера
  if (dialogue.verdict === null) return; // занятие не завершено — нечего записывать
  if (dialogue.rounds.length === 0) return; // защитно: диалог без раундов

  const { tournament } = dialogue.hand;
  const playerId = tournament.playerId;

  const profile = await db.playerProfile.findUnique({
    where: { playerId },
    select: { coachNotes: true, tournamentsCounted: true },
  });
  const stored = (profile?.coachNotes ?? null) as StoredCoachNotes | null;

  if (stored?.seenDialogues?.includes(dialogue.id)) return; // уже учтено (идемпотентность)

  const today = gameDayKey(new Date()); // день занятия — когда игрок прошёл диалог
  const counted = profile?.tournamentsCounted ?? 0;
  const existing = pruneCoachNotes(stored?.notes ?? [], today, counted);

  // Системные лики — контекст для модели (чтобы НЕ дублировала их в заметках).
  const card = await getPlayerCard(db, playerId, tournament.playedAt);

  const snapshot = dialogue.hand.tableData as unknown as { heroCards?: string[] };
  const request: CoachNotesRequest = {
    existingNotes: existing.map((n) => ({ date: n.date, text: n.text })),
    cards: snapshot.heroCards ?? [],
    chipResult: dialogue.hand.chipResult,
    rounds: dialogue.rounds.map((r) => ({
      roundNumber: r.roundNumber,
      question: r.question,
      answer: (r.answer as string) ?? "",
    })),
    verdict: dialogue.verdict,
    leaks: card?.leaks ?? [],
    maxNotes: COACH_NOTES_MAX,
  };

  const result = await getLlmAdapter().generateCoachNotes(request, { playerId });

  const notes = mergeCoachNotes(existing, result, today, counted);

  // Сигнал тесноты дневника (вопрос Артёма 2026-07-06 «как узнаем, что тренер
  // забывает?»): модель хотела сохранить больше заметок, чем влезает, — код обрезал.
  // Владельцу уходит пинг в Telegram; станет частым — поднимем COACH_NOTES_MAX.
  if (result.notes.length > COACH_NOTES_MAX) {
    void safeNotifyAdmin(
      `Дневник тренера упёрся в потолок: модель предложила ${result.notes.length} заметок при лимите ${COACH_NOTES_MAX} (игрок ${playerId}). Лишние обрезаны кодом — если такие сигналы пойдут часто, стоит поднять COACH_NOTES_MAX в config/memory.ts.`,
    );
  }
  const seenDialogues = [...(stored?.seenDialogues ?? []), dialogue.id].slice(-COACH_NOTES_SEEN_DIALOGUES);
  const coachNotes: StoredCoachNotes = { notes, seenDialogues };

  await db.playerProfile.upsert({
    where: { playerId },
    update: { coachNotes: coachNotes as unknown as Prisma.InputJsonValue },
    create: { playerId, coachNotes: coachNotes as unknown as Prisma.InputJsonValue },
  });

  // Свежая заметка должна попасть в карточку следующего разбора сразу, не через TTL.
  invalidatePlayerCardCache(playerId);
};

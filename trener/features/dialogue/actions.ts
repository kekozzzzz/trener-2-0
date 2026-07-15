import type { DialogueState } from "@prisma/client";
import type { TableSnapshot } from "@/parser/types";
import { prisma } from "@/infrastructure/db/client";
import { enqueue, kickWorker } from "@/infrastructure/queue";
import { getDialogueMaxRounds, getDialogueMaxRoundsThin, getDialogueAnswerMaxLength } from "@/config/dialogue";
import { topDecisionMark } from "@/parser/decision-weight";
import { assessAiAccess } from "@/features/usage/budget";
import { isSubscriptionGateEnabled } from "@/config/plans";

type SubmitAnswerInput = {
  handId: string;
  answer: string;
};

type SubmitAnswerResult =
  | { ok: true; state: DialogueState }
  | { ok: false; error: "DIALOGUE_NOT_FOUND" | "EMPTY_ANSWER" | "ANSWER_TOO_LONG" | "PAYWALL" | "LIMIT_REACHED" };

// Лёгкая операция (architecture/04-потоки-данных.md, раздел 2, событие №4):
// записывает ответ игрока на текущий раунд, переводит диалог
// QUESTION_ASKED → ANSWER_RECEIVED и ставит в фон следующий шаг —
// GENERATE_DIALOGUE_QUESTION для раундов 1..N-1, GENERATE_VERDICT для
// последнего раунда (config/dialogue.ts). Переход возможен только из
// QUESTION_ASKED (updateMany с условием в WHERE) — повторная отправка формы
// для диалога, который уже не в QUESTION_ASKED, не создаёт второй переход и
// не ставит вторую задачу, просто возвращает текущее состояние.
export async function submitAnswer(input: SubmitAnswerInput): Promise<SubmitAnswerResult> {
  const answer = input.answer.trim();

  const dialogue = await prisma.dialogue.findUnique({
    where: { handId: input.handId },
    include: {
      rounds: { orderBy: { roundNumber: "desc" }, take: 1 },
      hand: { include: { tournament: { select: { id: true, playerId: true } } } },
    },
  });
  if (!dialogue) return { ok: false, error: "DIALOGUE_NOT_FOUND" };

  if (dialogue.state !== "QUESTION_ASKED") {
    return { ok: true, state: dialogue.state };
  }

  if (!answer) return { ok: false, error: "EMPTY_ANSWER" };

  // Защитный потолок длины — ответ уходит в Claude (config/dialogue.ts,
  // architecture/07-безопасность.md, раздел 2): тормоз для платных токенов.
  if (answer.length > getDialogueAnswerMaxLength()) return { ok: false, error: "ANSWER_TOO_LONG" };

  // Гейт бюджета: следующий шаг (вопрос/вердикт) — платный вызов Claude.
  if (isSubscriptionGateEnabled()) {
    const { tournament } = dialogue.hand;
    const access = await assessAiAccess(prisma, tournament.playerId, { tournamentId: tournament.id });
    if (!access.allowed) return { ok: false, error: access.reason };
  }

  const currentRound = dialogue.rounds[0];
  // Достигнут потолок длины диалога — вердикт принудительно, без лишнего вызова ИИ.
  // Иначе ставим шаг вопроса: он прочитает ответ и сам решит — продолжать или
  // завершать (флаг complete). Длину диалога задаёт ИИ, потолок — лишь страховка
  // (config/dialogue.ts, решение 2026-06-27).
  //
  // Потолок зависит от «толщины» спота (2026-07-15): если у раздачи нет тяжёлого решения
  // (topDecisionMark = null — пассивный чек-даун и т.п.), копать нечего → низкий потолок, чтобы
  // тренер не занудствовал. Спот с решением (крупный фолд/блеф/колл) → полный потолок. Метку
  // считает парсер, не модель (Правило 1). Снимок и chipResult уже загружены с hand.
  const snapshot = dialogue.hand.tableData as unknown as TableSnapshot;
  const hasHeavyDecision = topDecisionMark(snapshot, dialogue.hand.chipResult ?? 0) !== null;
  const maxRounds = hasHeavyDecision ? getDialogueMaxRounds() : getDialogueMaxRoundsThin();
  const reachedCap = currentRound.roundNumber >= maxRounds;

  const enqueued = await prisma.$transaction(async (tx) => {
    const updated = await tx.dialogue.updateMany({
      where: { handId: input.handId, state: "QUESTION_ASKED" },
      data: { state: "ANSWER_RECEIVED" },
    });

    if (updated.count === 0) return false;

    await tx.dialogueRound.update({
      where: { id: currentRound.id },
      data: { answer },
    });

    if (reachedCap) {
      await enqueue(tx, { type: "GENERATE_VERDICT", payload: { handId: input.handId } });
    } else {
      await enqueue(tx, {
        type: "GENERATE_DIALOGUE_QUESTION",
        payload: { handId: input.handId, roundNumber: currentRound.roundNumber },
      });
    }
    return true;
  });

  // Будим воркер сразу после постановки задачи — следующий вопрос/вердикт считается
  // мгновенно, без ≤15с ожидания крона. Фоново: не держим ответ игрока.
  if (enqueued) void kickWorker(prisma);

  return { ok: true, state: "ANSWER_RECEIVED" };
}

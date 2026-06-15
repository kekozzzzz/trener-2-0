import type { DialogueState } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";
import { enqueue } from "@/infrastructure/queue";
import { getDialogueRoundsPerHand, getDialogueAnswerMaxLength } from "@/config/dialogue";

type SubmitAnswerInput = {
  handId: string;
  answer: string;
};

type SubmitAnswerResult =
  | { ok: true; state: DialogueState }
  | { ok: false; error: "DIALOGUE_NOT_FOUND" | "EMPTY_ANSWER" | "ANSWER_TOO_LONG" };

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
    include: { rounds: { orderBy: { roundNumber: "desc" }, take: 1 } },
  });
  if (!dialogue) return { ok: false, error: "DIALOGUE_NOT_FOUND" };

  if (dialogue.state !== "QUESTION_ASKED") {
    return { ok: true, state: dialogue.state };
  }

  if (!answer) return { ok: false, error: "EMPTY_ANSWER" };

  // Защитный потолок длины — ответ уходит в Claude (config/dialogue.ts,
  // architecture/07-безопасность.md, раздел 2): тормоз для платных токенов.
  if (answer.length > getDialogueAnswerMaxLength()) return { ok: false, error: "ANSWER_TOO_LONG" };

  const currentRound = dialogue.rounds[0];
  const isLastRound = currentRound.roundNumber >= getDialogueRoundsPerHand();

  await prisma.$transaction(async (tx) => {
    const updated = await tx.dialogue.updateMany({
      where: { handId: input.handId, state: "QUESTION_ASKED" },
      data: { state: "ANSWER_RECEIVED" },
    });

    if (updated.count > 0) {
      await tx.dialogueRound.update({
        where: { id: currentRound.id },
        data: { answer },
      });

      if (isLastRound) {
        await enqueue(tx, { type: "GENERATE_VERDICT", payload: { handId: input.handId } });
      } else {
        await enqueue(tx, {
          type: "GENERATE_DIALOGUE_QUESTION",
          payload: { handId: input.handId, roundNumber: currentRound.roundNumber },
        });
      }
    }
  });

  return { ok: true, state: "ANSWER_RECEIVED" };
}

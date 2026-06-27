import type { DialogueState } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";
import { getDialogueMaxRounds } from "@/config/dialogue";

export type DialogueRoundView = {
  roundNumber: number;
  question: string;
  answer: string | null;
};

export type DialogueView = {
  handId: string;
  state: DialogueState;
  totalRounds: number; // потолок длины диалога (страховка); реальную длину задаёт ИИ
  rounds: DialogueRoundView[];
  verdict: string | null;
  hand: {
    chipResult: number;
    played: string | null;
  };
};

// Чтение готового состояния диалога (architecture/04-потоки-данных.md):
// все числа и тексты уже посчитаны/сгенерированы парсером и LLM-шагами,
// здесь только читаем и приводим к виду для экрана (правило 1).
export async function getDialogue(handId: string): Promise<DialogueView | null> {
  const dialogue = await prisma.dialogue.findUnique({
    where: { handId },
    include: {
      rounds: { orderBy: { roundNumber: "asc" } },
      hand: true,
    },
  });
  if (!dialogue) return null;

  const analysis = dialogue.hand.analysis as { played?: string } | null;

  return {
    handId: dialogue.handId,
    state: dialogue.state,
    totalRounds: getDialogueMaxRounds(),
    rounds: dialogue.rounds.map((round) => ({
      roundNumber: round.roundNumber,
      question: round.question,
      answer: round.answer,
    })),
    verdict: dialogue.verdict,
    hand: {
      chipResult: dialogue.hand.chipResult,
      played: analysis?.played ?? null,
    },
  };
}

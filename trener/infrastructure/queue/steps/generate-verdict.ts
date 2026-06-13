import type { StepHandler } from "../types";
import type { TableSnapshot } from "@/parser/types";
import type { VerdictRequest } from "@/infrastructure/adapters/llm/types";
import { getLlmAdapter } from "@/infrastructure/adapters/llm";

type GenerateVerdictPayload = {
  handId: string;
};

// Финальный шаг сократовского диалога: разбирает ответ игрока на вопрос и
// сохраняет итог. Идемпотентно — если verdict уже сохранён, платный вызов
// пропускается (architecture/04-потоки-данных.md, раздел 4).
export const generateVerdictStep: StepHandler = async (task, db) => {
  const { handId } = task.payload as GenerateVerdictPayload;

  const dialogue = await db.dialogue.findUnique({
    where: { handId },
    include: { hand: { include: { tournament: true } } },
  });

  if (!dialogue || dialogue.hand.tournament.deletedAt) return; // удалено до того, как воркер взял задачу

  if (dialogue.verdict !== null) return; // уже выполнено (идемпотентность)

  // Правило 2: итог не формируется раньше ответа игрока. submitAnswer ставит
  // эту задачу только после перехода в ANSWER_RECEIVED — состояние
  // QUESTION_ASKED здесь означает нарушение инварианта, а не штатный путь.
  if (dialogue.state === "QUESTION_ASKED") {
    throw new Error(
      "GENERATE_VERDICT поставлена до ответа игрока (state=QUESTION_ASKED) — нарушение правила 2"
    );
  }

  const { hand } = dialogue;
  const { tournament } = hand;

  if (
    tournament.handsCount === null ||
    tournament.vpipPercent === null ||
    tournament.resultBuyins === null ||
    tournament.styleDiagnosis === null
  ) {
    throw new Error(
      "Метрики турнира не посчитаны — PARSE_TOURNAMENT должен выполниться раньше GENERATE_VERDICT"
    );
  }

  const analysis = hand.analysis as { draftVerdict?: string } | null;
  if (!analysis?.draftVerdict) {
    throw new Error(
      "В analysis раздачи нет draftVerdict — GENERATE_HAND_ANALYSIS должен выполниться раньше GENERATE_VERDICT"
    );
  }

  const request: VerdictRequest = {
    question: dialogue.question,
    // ANSWER_RECEIVED гарантирует, что answer записан (submitAnswer).
    answer: dialogue.answer as string,
    draftVerdict: analysis.draftVerdict,
    chipResult: hand.chipResult,
    tableSnapshot: hand.tableData as unknown as TableSnapshot,
    tournament: {
      handsCount: tournament.handsCount,
      vpipPercent: tournament.vpipPercent.toNumber(),
      resultBuyins: tournament.resultBuyins.toNumber(),
      styleDiagnosis: tournament.styleDiagnosis,
    },
  };

  const result = await getLlmAdapter().generateVerdict(request);

  await db.dialogue.update({
    where: { handId },
    data: { verdict: result.verdict, state: "VERDICT_SHOWN" },
  });
};

import type { StepHandler } from "../types";
import type { TableSnapshot } from "@/parser/types";
import type { VerdictRequest } from "@/infrastructure/adapters/llm/types";
import type { Locale } from "@/i18n/config";
import { getLlmAdapter } from "@/infrastructure/adapters/llm";

type GenerateVerdictPayload = {
  handId: string;
};

// Финальный шаг сократовского диалога: разбирает всю историю раундов и
// сохраняет итог. Идемпотентно — если verdict уже сохранён, платный вызов
// пропускается (architecture/04-потоки-данных.md, раздел 4).
export const generateVerdictStep: StepHandler = async (task, db) => {
  const { handId } = task.payload as GenerateVerdictPayload;

  const dialogue = await db.dialogue.findUnique({
    where: { handId },
    include: {
      hand: { include: { tournament: { include: { player: { select: { locale: true } } } } } },
      rounds: { orderBy: { roundNumber: "asc" } },
    },
  });

  if (!dialogue || dialogue.hand.tournament.deletedAt) return; // удалено до того, как воркер взял задачу

  if (dialogue.verdict !== null) return; // уже выполнено (идемпотентность)

  // Правило 2: итог не формируется раньше ответа игрока. Состояние ANSWER_RECEIVED —
  // единственный страж: вердикт ставится только после ответа (submitAnswer при
  // потолке длины ИЛИ шаг вопроса, когда ИИ решил «диалог исчерпан»). Длину диалога
  // задаёт ИИ (1..потолок), поэтому проверки «ровно N-й раунд» больше нет —
  // вердикт легитимен на любом отвеченном раунде. Решение 2026-06-27.
  if (dialogue.state !== "ANSWER_RECEIVED") {
    throw new Error(
      "GENERATE_VERDICT поставлена до ответа игрока — нарушение правила 2"
    );
  }

  const lastRound = dialogue.rounds[dialogue.rounds.length - 1];
  if (!lastRound) {
    throw new Error("GENERATE_VERDICT без единого раунда диалога — нечего разбирать");
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
    // Язык ответа тренера — язык интерфейса игрока (Player.locale); дефолт ru.
    locale: (tournament.player.locale as Locale) ?? "ru",
    // ANSWER_RECEIVED гарантирует, что answer записан на каждом раунде (submitAnswer).
    history: dialogue.rounds.map((round) => ({
      roundNumber: round.roundNumber,
      question: round.question,
      answer: round.answer as string,
    })),
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

  const result = await getLlmAdapter().generateVerdict(request, { playerId: tournament.playerId });

  await db.dialogue.update({
    where: { handId },
    data: { verdict: result.verdict, state: "VERDICT_SHOWN" },
  });
};

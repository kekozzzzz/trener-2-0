import type { StepHandler } from "../types";
import type { TableSnapshot } from "@/parser/types";
import type { NextQuestionRequest } from "@/infrastructure/adapters/llm/types";
import type { Locale } from "@/i18n/config";
import { getLlmAdapter } from "@/infrastructure/adapters/llm";
import { applyRangeMarker, applyTableMarker } from "@/config/dialogue";
import { findPriorSimilarSpots } from "@/features/memory/similar-spots";
import type { StoredSpot } from "@/features/memory/spot-marks";
import { opponentsForHand } from "./opponents-for-hand";
import { buildRangeReads } from "./range-facts";
import { enqueue } from "../enqueue";
import { getPlayerCard } from "@/features/memory/player-card";

type GenerateDialogueQuestionPayload = {
  handId: string;
  roundNumber: number; // номер только что отвеченного раунда
};

// Промежуточный шаг сократовского диалога: по истории отвеченных раундов
// формирует следующий наводящий вопрос и открывает новый раунд. Идемпотентно —
// если раунд roundNumber+1 уже создан, платный вызов пропускается
// (architecture/04-потоки-данных.md, раздел 4).
export const generateDialogueQuestionStep: StepHandler = async (task, db) => {
  const { handId, roundNumber } = task.payload as GenerateDialogueQuestionPayload;

  const dialogue = await db.dialogue.findUnique({
    where: { handId },
    include: {
      hand: { include: { tournament: { include: { player: { select: { locale: true } } } } } },
      rounds: { orderBy: { roundNumber: "asc" } },
    },
  });

  if (!dialogue || dialogue.hand.tournament.deletedAt) return; // удалено до того, как воркер взял задачу

  if (dialogue.verdict !== null) return; // диалог уже завершён вердиктом (идемпотентность)

  if (dialogue.rounds.length > roundNumber) return; // следующий раунд уже создан (идемпотентность)

  // Правило 2: следующий вопрос не формируется раньше ответа на текущий раунд.
  // submitAnswer ставит эту задачу только после перехода в ANSWER_RECEIVED —
  // любое другое состояние здесь означает нарушение инварианта.
  if (dialogue.state !== "ANSWER_RECEIVED") {
    throw new Error(
      "GENERATE_DIALOGUE_QUESTION поставлена до ответа игрока на текущий раунд — нарушение правила 2"
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
      "Метрики турнира не посчитаны — PARSE_TOURNAMENT должен выполниться раньше GENERATE_DIALOGUE_QUESTION"
    );
  }

  const analysis = hand.analysis as { draftVerdict?: string } | null;
  if (!analysis?.draftVerdict) {
    throw new Error(
      "В analysis раздачи нет draftVerdict — GENERATE_HAND_ANALYSIS должен выполниться раньше GENERATE_DIALOGUE_QUESTION"
    );
  }

  // Память тренера: похожие прошлые раздачи игрока — тот же спот (отпечаток) или та же
  // ошибка (метки детекторов). Правило 1 — всё нашёл парсер. Пусто, если у текущей раздачи
  // нет отпечатка (старые до миграции) или ничего не нашлось — блок в промпт не идёт.
  const currentFp = (hand.spot ?? null) as unknown as StoredSpot | null;
  const priorSpots = currentFp
    ? await findPriorSimilarSpots(db, {
        playerId: tournament.playerId,
        currentHandId: hand.id,
        currentFp,
      })
    : [];

  const history = dialogue.rounds.map((round) => ({
    roundNumber: round.roundNumber,
    question: round.question,
    answer: round.answer as string,
  }));
  const tableSnapshot = hand.tableData as unknown as TableSnapshot;
  const opponents = await opponentsForHand(db, hand);

  const request: NextQuestionRequest = {
    // Язык ответа тренера — язык интерфейса игрока (Player.locale); дефолт ru.
    locale: (tournament.player.locale as Locale) ?? "ru",
    // ANSWER_RECEIVED гарантирует, что answer записан на каждом раунде (submitAnswer).
    history,
    draftVerdict: analysis.draftVerdict,
    chipResult: hand.chipResult,
    tableSnapshot,
    tournament: {
      handsCount: tournament.handsCount,
      vpipPercent: tournament.vpipPercent.toNumber(),
      resultBuyins: tournament.resultBuyins.toNumber(),
      styleDiagnosis: tournament.styleDiagnosis,
    },
    priorSpots,
    // Тип оппонента перед тренером и на этапе диалога, не только в первичном разборе.
    opponents,
    // Диапазоны, отмеченные игроком на сетке, + точные числа парсера против них
    // (правило 1: эквити/комбо/сверки посчитаны кодом до вызова ИИ).
    rangeReads: buildRangeReads({ history, tableSnapshot, opponents }),
    // Карточка ученика — память тренера об игроке (см. features/memory/player-card).
    playerCard: await getPlayerCard(db, tournament.playerId, tournament.playedAt),
  };

  const result = await getLlmAdapter().generateNextQuestion(request, { playerId: tournament.playerId });

  // ИИ прочитал ответ игрока и решил, что диалог исчерпан (игрок дошёл до сути либо
  // копать дальше бессмысленно). Раунд не создаём — ставим вердикт. Состояние
  // остаётся ANSWER_RECEIVED: правило 2 соблюдено (вердикт идёт после ответа игрока),
  // GENERATE_VERDICT идемпотентен по dialogue.verdict. Решение 2026-06-27.
  if (result.complete) {
    await enqueue(db, { type: "GENERATE_VERDICT", payload: { handId } });
    return;
  }

  await db.$transaction(async (tx) => {
    await tx.dialogueRound.create({
      data: {
        dialogueId: dialogue.id,
        roundNumber: roundNumber + 1,
        question: applyTableMarker(applyRangeMarker(result.question, result.answerMode), result.tableActionIndex),
      },
    });

    await tx.dialogue.update({
      where: { handId },
      data: { state: "QUESTION_ASKED" },
    });
  });
};

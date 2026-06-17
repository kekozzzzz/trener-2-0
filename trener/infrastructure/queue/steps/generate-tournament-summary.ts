import { Prisma } from "@prisma/client";
import type { StepHandler } from "../types";
import type { TournamentSummaryHand } from "@/infrastructure/adapters/llm/types";
import { getLlmAdapter } from "@/infrastructure/adapters/llm";

type GenerateTournamentSummaryPayload = {
  tournamentId: string;
};

// Шаг «Обзор турнира»: собирает общую картину (overview + ключевые моменты со
// ссылками на раздачи) из уже посчитанных метрик и готовых разборов раздач
// карточки (правило 1 — LLM ничего не пересчитывает). Ставится один раз при
// готовности карточки (generate-hand-analysis.ts → markCardReadyIfComplete).
// Идемпотентность: если summary уже сохранён — платный вызов пропускается.
export const generateTournamentSummaryStep: StepHandler = async (task, db) => {
  const { tournamentId } = task.payload as GenerateTournamentSummaryPayload;

  const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament || tournament.deletedAt) return; // удалено до того, как воркер взял задачу
  if (tournament.summary !== null) return; // обзор уже собран

  if (
    tournament.handsCount === null ||
    tournament.vpipPercent === null ||
    tournament.resultBuyins === null ||
    tournament.styleDiagnosis === null
  ) {
    throw new Error(
      "Метрики турнира не посчитаны — PARSE_TOURNAMENT должен выполниться раньше GENERATE_TOURNAMENT_SUMMARY"
    );
  }

  // Раздачи карточки с готовым разбором, в стабильном порядке (как на карточке) —
  // индекс в этом списке и есть ссылка, по которой LLM указывает момент.
  const cardHands = await db.hand.findMany({
    where: { tournamentId, selectedForCard: true, analysis: { not: Prisma.DbNull } },
    include: { dialogue: true },
    orderBy: { createdAt: "asc" },
  });

  if (cardHands.length === 0) return; // нечего обобщать

  const summaryHands: TournamentSummaryHand[] = [];
  cardHands.forEach((hand, index) => {
    const analysis = hand.analysis as { played?: string; optimal?: string; note?: string } | null;
    if (!analysis?.played || !analysis?.optimal) return; // защитно: разбор без played/optimal пропускаем
    summaryHands.push({
      index,
      importanceLevel: hand.importanceLevel,
      chipResult: hand.chipResult,
      played: analysis.played,
      optimal: analysis.optimal,
      note: analysis.note ?? undefined,
      verdict: hand.dialogue?.verdict ?? undefined,
    });
  });

  if (summaryHands.length === 0) return;

  const result = await getLlmAdapter().generateTournamentSummary({
    tournament: {
      handsCount: tournament.handsCount,
      vpipPercent: tournament.vpipPercent.toNumber(),
      resultBuyins: tournament.resultBuyins.toNumber(),
      styleDiagnosis: tournament.styleDiagnosis,
    },
    hands: summaryHands,
  });

  // Мапим момент (индекс в cardHands) → handId. Индекс вне диапазона отбрасываем —
  // ссылка на несуществующую раздачу невозможна (надёжность ссылок, раздел 0 плана).
  const moments = result.moments
    .filter((m) => m.hand >= 0 && m.hand < cardHands.length)
    .map((m) => ({ handId: cardHands[m.hand].id, label: m.label }));

  const summary = { overview: result.overview, moments };

  await db.tournament.updateMany({
    where: { id: tournamentId, deletedAt: null },
    data: { summary: summary as unknown as Prisma.InputJsonValue },
  });
};

import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { StepHandler } from "../types";
import type { TableSnapshot } from "@/parser/types";
import type { HandAnalysisRequest } from "@/infrastructure/adapters/llm/types";
import { getLlmAdapter } from "@/infrastructure/adapters/llm";

type GenerateHandAnalysisPayload = {
  handId: string;
};

// Генерирует LLM-разбор одной раздачи карточки. Идемпотентно: если analysis уже
// сохранён — пропускает платный вызов и сразу проверяет готовность карточки
// (повтор после крэша между сохранением разбора и завершением задачи).
export const generateHandAnalysisStep: StepHandler = async (task, db) => {
  const { handId } = task.payload as GenerateHandAnalysisPayload;

  const hand = await db.hand.findUnique({
    where: { id: handId },
    include: { tournament: true },
  });

  if (!hand || hand.tournament.deletedAt) return; // удалено до того, как воркер взял задачу

  if (hand.analysis === null) {
    const { tournament } = hand;
    if (
      tournament.handsCount === null ||
      tournament.vpipPercent === null ||
      tournament.resultBuyins === null ||
      tournament.styleDiagnosis === null
    ) {
      throw new Error(
        "Метрики турнира не посчитаны — PARSE_TOURNAMENT должен выполниться раньше GENERATE_HAND_ANALYSIS"
      );
    }

    const request: HandAnalysisRequest = {
      importanceLevel: hand.importanceLevel,
      chipResult: hand.chipResult,
      tableSnapshot: hand.tableData as unknown as TableSnapshot,
      tournament: {
        handsCount: tournament.handsCount,
        vpipPercent: tournament.vpipPercent.toNumber(),
        resultBuyins: tournament.resultBuyins.toNumber(),
        styleDiagnosis: tournament.styleDiagnosis,
      },
    };

    const result = await getLlmAdapter().generateHandAnalysis(request);

    await db.$transaction(async (tx) => {
      await tx.hand.update({
        where: { id: handId },
        data: { analysis: result as unknown as Prisma.InputJsonValue },
      });

      // Сократовский вопрос (правило 2): для CRITICAL раздач диалог открывается
      // сразу, вердикт остаётся в analysis.draftVerdict до ответа игрока.
      if (hand.importanceLevel === "CRITICAL" && result.question) {
        await tx.dialogue.upsert({
          where: { handId },
          create: { handId, question: result.question, state: "QUESTION_ASKED" },
          update: {},
        });
      }
    });
  }

  await markCardReadyIfComplete(db, hand.tournamentId);
};

// Карточка готова, когда у всех отобранных раздач (selected_for_card) либо есть
// analysis, либо их GENERATE_HAND_ANALYSIS ушла в карантин — одна сломанная
// раздача не блокирует всю карточку (architecture/04-потоки-данных.md).
async function markCardReadyIfComplete(db: PrismaClient, tournamentId: string): Promise<void> {
  const pending = await db.hand.findMany({
    where: { tournamentId, selectedForCard: true, analysis: { equals: Prisma.DbNull } },
    select: { id: true },
  });

  if (pending.length > 0) {
    const poisoned = await db.$queryRaw<{ handId: string }[]>`
      SELECT payload->>'handId' AS "handId" FROM tasks
      WHERE type = 'GENERATE_HAND_ANALYSIS' AND status = 'POISONED'
        AND payload->>'handId' IN (${Prisma.join(pending.map((h) => h.id))})
    `;
    const poisonedIds = new Set(poisoned.map((p) => p.handId));
    if (pending.some((h) => !poisonedIds.has(h.id))) return; // ещё есть необработанные раздачи
  }

  await db.tournament.updateMany({
    where: { id: tournamentId, deletedAt: null, status: { not: "CARD_READY" } },
    data: { status: "CARD_READY" },
  });
}

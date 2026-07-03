import type { PrismaClient } from "@prisma/client";
import type { TableSnapshot } from "@/parser/types";
import type { OpponentFact } from "@/parser/opponent-profile";
import { profileHandOpponents } from "@/parser/opponent-profile";

// Профиль злодеев ОДНОЙ раздачи — по рукам того же турнира, сыгранным ДО неё (что
// игрок мог знать к своему решению). Общий для всех шагов тренера (разбор, вопрос
// диалога, вердикт, чат), чтобы тип оппонента был перед тренером на КАЖДОМ этапе,
// а не только в первичном разборе. Правило 1: типы считает парсер.
//
// undefined, если у раздачи нет момента playedAt (старые загрузки до миграции) —
// тогда окно «до текущей» не построить, блок в промпт не идёт, поведение прежнее.
export async function opponentsForHand(
  db: PrismaClient,
  hand: { tournamentId: string; playedAt: Date | null; tableData: unknown },
): Promise<OpponentFact[] | undefined> {
  if (!hand.playedAt) return undefined;
  const priorHands = await db.hand.findMany({
    where: { tournamentId: hand.tournamentId, playedAt: { lt: hand.playedAt } },
    select: { tableData: true },
  });
  return profileHandOpponents(priorHands, hand.tableData as unknown as TableSnapshot);
}

import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import type { StepHandler } from "../types";
import type { ParsedTournament } from "@/parser/types";
import { selectHandsForCard } from "@/features/card/select-hands";
import { enqueue } from "../enqueue";

type ParsePayload = {
  tournamentId: string;
  parsed: ParsedTournament;
};

// Сохраняет ВСЕ размеченные раздачи турнира, отмечает ~10 отобранных для карточки
// (selectHandsForCard) флагом selected_for_card и ставит на каждую из них задачу
// GENERATE_HAND_ANALYSIS. Числа уже посчитаны парсером синхронно при загрузке
// (features/tournaments/actions.ts) — здесь только запись.
export const parseTournamentStep: StepHandler = async (task, db) => {
  const { tournamentId, parsed } = task.payload as ParsePayload;
  const { handsCount, vpipPercent, resultBuyins, styleDiagnosis, hands } = parsed;

  await db.$transaction(async (tx) => {
    const { count } = await tx.tournament.updateMany({
      where: { id: tournamentId, deletedAt: null },
      data: { status: "PARSED", handsCount, vpipPercent, resultBuyins, styleDiagnosis },
    });

    if (count === 0) return; // soft-deleted before worker ran — skip silently

    // Идемпотентность: если задача повторяется после крэша между записью hands
    // и постановкой GENERATE_HAND_ANALYSIS — не создаём раздачи второй раз.
    const existing = await tx.hand.count({ where: { tournamentId } });
    if (existing > 0) return;

    const selected = new Set(selectHandsForCard(hands));

    const rows = hands.map((hand) => ({
      id: randomUUID(),
      tournamentId,
      importanceLevel: hand.importanceLevel,
      chipResult: hand.chipResult,
      tableData: hand.tableSnapshot as unknown as Prisma.InputJsonValue,
      selectedForCard: selected.has(hand),
    }));

    await tx.hand.createMany({ data: rows });

    for (const row of rows) {
      if (!row.selectedForCard) continue;
      await enqueue(tx, { type: "GENERATE_HAND_ANALYSIS", payload: { handId: row.id } });
    }
  });
};

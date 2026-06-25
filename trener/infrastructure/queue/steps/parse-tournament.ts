import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import type { StepHandler } from "../types";
import type { ParsedTournament } from "@/parser/types";
import { selectHandsForCard } from "@/features/card/select-hands";
import { assessAiAccess } from "@/features/usage/budget";
import { isSubscriptionGateEnabled } from "@/config/plans";
import { enqueue } from "../enqueue";

type ParsePayload = {
  tournamentId: string;
  parsed: ParsedTournament;
};

// Сохраняет ВСЕ размеченные раздачи турнира, отмечает ~10 отобранных для карточки
// (selectHandsForCard) флагом selected_for_card. Числа уже посчитаны парсером
// синхронно при загрузке (features/tournaments/actions.ts) — здесь только запись.
//
// Платный гейт РАЗБОРА (правило №1): задачи GENERATE_HAND_ANALYSIS — и вся выросшая
// из них ИИ-цепочка (диалоги/вердикты/обзор/характеристика) — ставятся ТОЛЬКО если
// разбор этого турнира разрешён (assessAiAccess: первый бесплатный / активная
// подписка с остатком бюджета). Иначе турнир «заперт»: метрики сохранены и видны,
// но ни одна платная задача не порождается; analysis_unlocked=false. Открыть позже —
// unlockTournamentAnalysis (app/tournament/[id]/actions.ts).
export const parseTournamentStep: StepHandler = async (task, db) => {
  const { tournamentId, parsed } = task.payload as ParsePayload;
  const { handsCount, vpipPercent, resultBuyins, styleDiagnosis, hands } = parsed;

  // Разрешён ли разбор этого турнира. Гейт выключен → всегда открыт (дев/тесты).
  const owner = await db.tournament.findUnique({
    where: { id: tournamentId },
    select: { playerId: true },
  });
  let unlocked = true;
  if (owner && isSubscriptionGateEnabled()) {
    const access = await assessAiAccess(db, owner.playerId, { tournamentId });
    unlocked = access.allowed;
  }

  await db.$transaction(async (tx) => {
    const { count } = await tx.tournament.updateMany({
      where: { id: tournamentId, deletedAt: null },
      data: { status: "PARSED", handsCount, vpipPercent, resultBuyins, styleDiagnosis, analysisUnlocked: unlocked },
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

    // Заперт → платную ИИ-цепочку НЕ запускаем (метрики уже сохранены).
    if (!unlocked) return;

    for (const row of rows) {
      if (!row.selectedForCard) continue;
      await enqueue(tx, { type: "GENERATE_HAND_ANALYSIS", payload: { handId: row.id } });
    }
  });
};

import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import type { StepHandler } from "../types";
import type { ParsedTournament } from "@/parser/types";
import { selectHandsForCard } from "@/features/card/select-hands";
import { computeSpotFingerprint, spotKey } from "@/parser/spot-fingerprint";
import { computeSpotMarks, type StoredSpot } from "@/features/memory/spot-marks";
import { enqueue, CRITICAL_ANALYSIS_PRIORITY } from "../enqueue";
import { invalidateDecisionChainsCache } from "@/features/profile/decision-chains";

type ParsePayload = {
  tournamentId: string;
  parsed: ParsedTournament;
};

// Сохраняет ВСЕ размеченные раздачи турнира, отмечает ~10-20 отобранных для карточки
// (selectHandsForCard) флагом selected_for_card. Числа уже посчитаны парсером
// синхронно при загрузке (features/tournaments/actions.ts) — здесь только запись.
//
// ЛЕНИВЫЙ РАЗБОР: турнир рождается «распарсен, но не разобран» (analysis_unlocked=false),
// и ИИ-цепочку (GENERATE_HAND_ANALYSIS → диалоги/вердикты/обзор) НЕ запускаем сами.
// Игрок открывает разбор кнопкой «Разобрать» (unlockTournamentAnalysisAction — там и
// гейт доступа/лимита, правило №1). Исключение — конверсионный хук: ПЕРВЫЙ турнир игрока
// разбирается сразу, чтобы новичок увидел магию без лишнего шага (первый всегда бесплатен).
// Так залив сотни турниров не жжёт бюджет: метрики по всем бесплатны, разбор — по клику.
export const parseTournamentStep: StepHandler = async (task, db) => {
  const { tournamentId, parsed } = task.payload as ParsePayload;
  const { handsCount, vpipPercent, resultBuyins, styleDiagnosis, hands } = parsed;

  const owner = await db.tournament.findUnique({
    where: { id: tournamentId },
    select: { playerId: true },
  });

  // Авто-разбор только у ПЕРВОГО (старейшего) турнира игрока — конверсионный хук.
  // Остальные лениво: ждут клика «Разобрать». Определяем по старейшему турниру игрока.
  const firstEver = owner
    ? (
        await db.tournament.findFirst({
          where: { playerId: owner.playerId, deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { id: true },
        })
      )?.id === tournamentId
    : false;
  const unlocked = firstEver;

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

    const rows = hands.map((hand) => {
      // Отпечаток спота + метки ошибок — детерминированно из снимка (Правило 1:
      // похожесть и ошибки считает парсер). Лежат в одном JSON: hand.spot.
      const fingerprint = computeSpotFingerprint(hand.tableSnapshot);
      const stored: StoredSpot = { ...fingerprint, marks: computeSpotMarks(hand.tableSnapshot) };
      return {
        id: randomUUID(),
        tournamentId,
        importanceLevel: hand.importanceLevel,
        chipResult: hand.chipResult,
        tableData: hand.tableSnapshot as unknown as Prisma.InputJsonValue,
        selectedForCard: selected.has(hand),
        spot: stored as unknown as Prisma.InputJsonValue,
        spotKey: spotKey(fingerprint),
        playedAt: hand.playedAt ? new Date(hand.playedAt) : null, // момент раздачи — порядок для профиля оппонента
      };
    });

    await tx.hand.createMany({ data: rows });

    // Лениво (не первый турнир) → ИИ-цепочку НЕ запускаем, ждём клика «Разобрать».
    // Метрики и раздачи уже сохранены и видны бесплатно.
    if (!unlocked) return;

    for (const row of rows) {
      if (!row.selectedForCard) continue;
      // Критические раздачи — вперёд рядового разбора, чтобы всплывали первыми.
      await enqueue(tx, {
        type: "GENERATE_HAND_ANALYSIS",
        payload: { handId: row.id },
        priority: row.importanceLevel === "CRITICAL" ? CRITICAL_ANALYSIS_PRIORITY : 0,
      });
    }
  });

  // Новый турнир меняет цепочки решений за всё время — сбрасываем их кэш, иначе тренер будет
  // считать по устаревшим данным до истечения TTL.
  if (owner) invalidateDecisionChainsCache(owner.playerId);
};

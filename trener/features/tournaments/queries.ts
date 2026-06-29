import type { TournamentStatus, PlayerStyle } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";

// Строка списка «Мои турниры» / дашборда. Decimal приводим к number здесь,
// чтобы вид для экрана был чистым (как в features/dialogue/queries.ts).
export type TournamentListItem = {
  id: string;
  name: string | null;
  room: string | null;
  playedAt: Date;
  status: TournamentStatus;
  vpipPercent: number | null;
  handsCount: number | null;
  resultBuyins: number | null;
  styleDiagnosis: PlayerStyle | null;
  fullyReviewed: boolean;  // турнир пройден целиком: разбор открыт, готов, и каждая карточная раздача завершена/просмотрена
};

// Турниры игрока: только свои (по playerId из сессии — защита от IDOR),
// без удалённых (deletedAt IS NULL, запрет 5), по дате игры свежие сверху
// (architecture/03-база-данных.md, индекс idx_tournaments_player_timeline).
async function queryTournaments(playerId: string, limit?: number): Promise<TournamentListItem[]> {
  const rows = await prisma.tournament.findMany({
    where: { playerId, deletedAt: null },
    orderBy: { playedAt: "desc" },
    ...(limit != null ? { take: limit } : {}),
    select: {
      id: true,
      name: true,
      room: true,
      playedAt: true,
      status: true,
      analysisUnlocked: true,
      vpipPercent: true,
      handsCount: true,
      resultBuyins: true,
      styleDiagnosis: true,
    },
  });

  // «Пройден целиком» по карточным раздачам всех турниров списка — одним запросом
  // (без N+1). Раздача готова: есть диалог → вердикт показан; нет диалога (простая) →
  // открыта игроком (viewedAt). Турнир пройден, если разбор открыт, он досчитан
  // (CARD_READY), карточные раздачи есть и все они готовы.
  const cardHands = await prisma.hand.findMany({
    where: { tournamentId: { in: rows.map((t) => t.id) }, selectedForCard: true },
    select: { tournamentId: true, viewedAt: true, dialogue: { select: { state: true } } },
  });
  const handsByTournament = new Map<string, { done: number; total: number }>();
  for (const h of cardHands) {
    const agg = handsByTournament.get(h.tournamentId) ?? { done: 0, total: 0 };
    agg.total += 1;
    const handDone = h.dialogue ? h.dialogue.state === "VERDICT_SHOWN" : h.viewedAt !== null;
    if (handDone) agg.done += 1;
    handsByTournament.set(h.tournamentId, agg);
  }

  return rows.map((t) => {
    const agg = handsByTournament.get(t.id);
    const fullyReviewed =
      t.status === "CARD_READY" &&
      t.analysisUnlocked &&
      agg != null &&
      agg.total > 0 &&
      agg.done === agg.total;
    return {
      id: t.id,
      name: t.name,
      room: t.room,
      playedAt: t.playedAt,
      status: t.status,
      vpipPercent: t.vpipPercent != null ? Number(t.vpipPercent) : null,
      handsCount: t.handsCount,
      resultBuyins: t.resultBuyins != null ? Number(t.resultBuyins) : null,
      styleDiagnosis: t.styleDiagnosis,
      fullyReviewed,
    };
  });
}

// Все турниры игрока — для страницы «Мои турниры».
export function listMyTournaments(playerId: string): Promise<TournamentListItem[]> {
  return queryTournaments(playerId);
}

// Последние N турниров — для секции на дашборде (главная для залогиненного).
export function recentTournaments(playerId: string, limit = 5): Promise<TournamentListItem[]> {
  return queryTournaments(playerId, limit);
}

import type { TournamentStatus, PlayerStyle } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";

// Строка списка «Мои турниры» / дашборда. Decimal приводим к number здесь,
// чтобы вид для экрана был чистым (как в features/dialogue/queries.ts).
export type TournamentListItem = {
  id: string;
  playedAt: Date;
  status: TournamentStatus;
  vpipPercent: number | null;
  handsCount: number | null;
  resultBuyins: number | null;
  styleDiagnosis: PlayerStyle | null;
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
      playedAt: true,
      status: true,
      vpipPercent: true,
      handsCount: true,
      resultBuyins: true,
      styleDiagnosis: true,
    },
  });

  return rows.map((t) => ({
    id: t.id,
    playedAt: t.playedAt,
    status: t.status,
    vpipPercent: t.vpipPercent != null ? Number(t.vpipPercent) : null,
    handsCount: t.handsCount,
    resultBuyins: t.resultBuyins != null ? Number(t.resultBuyins) : null,
    styleDiagnosis: t.styleDiagnosis,
  }));
}

// Все турниры игрока — для страницы «Мои турниры».
export function listMyTournaments(playerId: string): Promise<TournamentListItem[]> {
  return queryTournaments(playerId);
}

// Последние N турниров — для секции на дашборде (главная для залогиненного).
export function recentTournaments(playerId: string, limit = 5): Promise<TournamentListItem[]> {
  return queryTournaments(playerId, limit);
}

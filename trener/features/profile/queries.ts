import { prisma } from "@/infrastructure/db/client";
import { aggregateOpenChart, type OpenChartFacts } from "./open-chart";

// Сводная характеристика игрока для показа в личном кабинете. Только свой профиль
// (по playerId из сессии — защита от IDOR). null, пока текст ещё не собран.
export type PlayerCharacteristicView = {
  characteristic: string;
  tournamentsCounted: number;
};

export async function getPlayerCharacteristic(playerId: string): Promise<PlayerCharacteristicView | null> {
  const profile = await prisma.playerProfile.findUnique({
    where: { playerId },
    select: { characteristic: true, tournamentsCounted: true },
  });
  if (!profile?.characteristic) return null;
  return { characteristic: profile.characteristic, tournamentsCounted: profile.tournamentsCounted };
}

// Карта открываний игрока для кнопки «Твои чарты». Считается на лету по всем
// раздачам всех учтённых турниров (детерминированно, без LLM, Правило 1). null —
// если учитывать нечего. Только свой playerId — защита от IDOR.
export type OpenChartView = {
  chart: OpenChartFacts;
  tournamentsCounted: number;
};

export async function getOpenChart(playerId: string): Promise<OpenChartView | null> {
  // Тот же фильтр учтённых турниров, что у характеристики — счётчик и порог
  // надёжности (CHARACTERISTIC_RELIABLE_FROM) совпадают с показанным в профиле.
  const tournaments = await prisma.tournament.findMany({
    where: {
      playerId,
      deletedAt: null,
      status: { in: ["PARSED", "CARD_READY"] },
      vpipPercent: { not: null },
      resultBuyins: { not: null },
      handsCount: { not: null },
      styleDiagnosis: { not: null },
    },
    select: { id: true },
  });
  if (tournaments.length === 0) return null;

  const hands = await prisma.hand.findMany({
    where: { tournamentId: { in: tournaments.map((t) => t.id) } },
    select: { tableData: true },
  });

  return { chart: aggregateOpenChart(hands), tournamentsCounted: tournaments.length };
}

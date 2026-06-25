import { prisma } from "@/infrastructure/db/client";

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

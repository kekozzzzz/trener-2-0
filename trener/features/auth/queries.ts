import { prisma } from "@/infrastructure/db/client";
import { getSession } from "./session";

export async function getCurrentPlayer(): Promise<{ id: string; email: string | null } | null> {
  const session = await getSession();
  if (!session) return null;

  // closedAt: null — закрытый (анонимизированный) аккаунт не считается залогиненным.
  const player = await prisma.player.findFirst({
    where: { id: session.playerId, closedAt: null },
    select: { id: true, email: true },
  });

  return player;
}

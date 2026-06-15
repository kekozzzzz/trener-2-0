import { prisma } from "@/infrastructure/db/client";
import { getSession } from "./session";

export async function getCurrentPlayer(): Promise<{ id: string; email: string | null } | null> {
  const session = await getSession();
  if (!session) return null;

  const player = await prisma.player.findUnique({
    where: { id: session.playerId },
    select: { id: true, email: true },
  });

  return player;
}

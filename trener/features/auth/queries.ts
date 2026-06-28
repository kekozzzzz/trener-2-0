import { prisma } from "@/infrastructure/db/client";
import { getSession } from "./session";

export async function getCurrentPlayer(): Promise<{
  id: string;
  email: string | null;
  nickname: string | null;
  passwordChangedAt: Date | null;
  hasPassword: boolean; // есть ли у аккаунта пароль (у заведённых по ссылке его нет)
} | null> {
  const session = await getSession();
  if (!session) return null;

  // closedAt: null — закрытый (анонимизированный) аккаунт не считается залогиненным.
  // sessionsValidFrom <= iat — сессия не должна быть старше последней смены пароля /
  // выхода на всех устройствах (см. session.ts).
  const player = await prisma.player.findFirst({
    where: {
      id: session.playerId,
      closedAt: null,
      sessionsValidFrom: { lte: new Date(session.iat) },
    },
    // passwordHash берём только чтобы вернуть булев флаг — сам хэш наружу не отдаём.
    select: { id: true, email: true, nickname: true, passwordChangedAt: true, passwordHash: true },
  });
  if (!player) return null;

  const { passwordHash, ...rest } = player;
  return { ...rest, hasPassword: Boolean(passwordHash) };
}

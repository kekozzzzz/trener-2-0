import { prisma } from "@/infrastructure/db/client";
import { getSession } from "./session";

// Проверка прав на раздачу (architecture/07-безопасность.md, раздел 2,
// «Проверка прав»): игрок не может получить чужую запись, даже подставив чужой
// handId в адрес страницы или server action. Возвращает playerId при успехе;
// null — если сессии нет, раздача не найдена, удалён её турнир или она
// принадлежит другому игроку. Сознательно один и тот же null на все случаи —
// чтобы наружу не утекал факт существования чужой раздачи (без перечисления id).
//
// Используется getSession, а не requireSession: helper не редиректит сам —
// решение, что делать с отказом (404 в API, ошибка формы в action, redirect на
// странице), принимает вызывающий на своей точке входа.
export async function authorizeHand(handId: string): Promise<{ playerId: string } | null> {
  const session = await getSession();
  if (!session) return null;

  // Все условия отказа — в одном запросе (единый null наружу): раздача принадлежит
  // этому игроку, её турнир не удалён, и сессия не старше последней смены пароля /
  // выхода на всех устройствах владельца (sessionsValidFrom <= iat, см. session.ts).
  const hand = await prisma.hand.findFirst({
    where: {
      id: handId,
      tournament: {
        deletedAt: null,
        playerId: session.playerId,
        player: { sessionsValidFrom: { lte: new Date(session.iat) } },
      },
    },
    select: { id: true },
  });
  if (!hand) return null;
  return { playerId: session.playerId };
}

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

  const hand = await prisma.hand.findUnique({
    where: { id: handId },
    select: { tournament: { select: { playerId: true, deletedAt: true } } },
  });
  if (!hand || hand.tournament.deletedAt || hand.tournament.playerId !== session.playerId) {
    return null;
  }
  return { playerId: session.playerId };
}

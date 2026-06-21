import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/client";
import { requireSession } from "@/features/auth/session";
import { isAdminEmail } from "@/config/admin";
import { buildCostReport } from "@/features/usage/cost-report";

export async function GET(): Promise<NextResponse> {
  const { playerId } = await requireSession();

  const tournaments = await prisma.tournament.findMany({
    where: { playerId, deletedAt: null },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      status: true,
      createdAt: true,
      vpipPercent: true,
      handsCount: true,
      resultBuyins: true,
    },
  });

  const tournamentIds = new Set(tournaments.map((t) => t.id));

  const allTasks = await prisma.task.findMany({
    where: { type: "PARSE_TOURNAMENT" },
    orderBy: { createdAt: "desc" },
    take: 100,
    // Технический текст ошибки (task.error) наружу не отдаём — он может содержать
    // внутренние сообщения парсера/LLM. Клиенту довольно статуса задачи; полный
    // текст остаётся в БД для владельца продукта (architecture/07-безопасность.md,
    // раздел 2 — журнал с причиной доступен администратору, не пользователю).
    select: {
      id: true,
      type: true,
      status: true,
      payload: true,
      createdAt: true,
      attempt: true,
    },
  });

  const tasks = allTasks
    .filter((t) => {
      const p = t.payload as { tournamentId?: string };
      return p?.tournamentId != null && tournamentIds.has(p.tournamentId);
    })
    .slice(0, 20);

  // Расходы LLM по всем игрокам — АДМИНСКИЕ данные. Считаем и отдаём ТОЛЬКО если
  // email текущего игрока в allowlist (config/admin.ts). Обычный залогиненный
  // пользователь получает cost === null и ничего чужого не видит.
  const player = await prisma.player.findUnique({ where: { id: playerId }, select: { email: true } });
  const cost = isAdminEmail(player?.email) ? await buildCostReport(prisma, 24 * 30) : null;

  return NextResponse.json({ tournaments, tasks, cost });
}

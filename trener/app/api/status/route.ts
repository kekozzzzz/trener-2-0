import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/client";
import { requireSession } from "@/features/auth/session";

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
    select: {
      id: true,
      type: true,
      status: true,
      payload: true,
      createdAt: true,
      error: true,
      attempt: true,
    },
  });

  const tasks = allTasks
    .filter((t) => {
      const p = t.payload as { tournamentId?: string };
      return p?.tournamentId != null && tournamentIds.has(p.tournamentId);
    })
    .slice(0, 20);

  return NextResponse.json({ tournaments, tasks });
}

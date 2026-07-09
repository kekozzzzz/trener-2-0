import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";
import { requireSession } from "@/features/auth/session";
import { isTournamentParseFailed } from "@/features/queue-recovery/queries";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const { playerId } = await requireSession();

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    select: { status: true, playerId: true, deletedAt: true, summary: true, analysisUnlocked: true },
  });

  if (!tournament || tournament.deletedAt || tournament.playerId !== playerId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Прогресс разбора для живой страницы: сколько отобранных раздач уже разобрано и
  // готова ли общая картина. Клиент live-refresh по этим числам решает, обновлять
  // ли страницу и когда перестать опрашивать.
  const handsTotal = await prisma.hand.count({
    where: { tournamentId: id, selectedForCard: true },
  });
  const handsReady = await prisma.hand.count({
    where: { tournamentId: id, selectedForCard: true, analysis: { not: Prisma.DbNull } },
  });

  // failed=true, если парсинг турнира сдох в карантин (иначе экран парсинга крутится вечно).
  // Считаем только пока турнир не разобран.
  const failed = tournament.status === "UPLOADED" ? await isTournamentParseFailed(id) : false;

  return NextResponse.json({
    status: tournament.status,
    summaryReady: tournament.summary !== null,
    handsTotal,
    handsReady,
    failed,
  });
}

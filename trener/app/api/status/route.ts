import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/client";

const DEMO_PLAYER_ID = "00000000-0000-0000-0000-000000000001";

export async function GET(): Promise<NextResponse> {
  const [tournaments, tasks] = await Promise.all([
    prisma.tournament.findMany({
      where: { playerId: DEMO_PLAYER_ID, deletedAt: null },
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
    }),
    prisma.task.findMany({
      where: { type: "PARSE_TOURNAMENT" },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        type: true,
        status: true,
        payload: true,
        createdAt: true,
        error: true,
        attempt: true,
      },
    }),
  ]);

  return NextResponse.json({ tournaments, tasks });
}

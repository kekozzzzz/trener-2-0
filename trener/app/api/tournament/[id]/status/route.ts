import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/client";
import { requireSession } from "@/features/auth/session";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const { playerId } = await requireSession();

  const tournament = await prisma.tournament.findUnique({
    where: { id },
    select: { status: true, playerId: true, deletedAt: true },
  });

  if (!tournament || tournament.deletedAt || tournament.playerId !== playerId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ status: tournament.status });
}

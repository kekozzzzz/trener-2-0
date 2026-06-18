import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/client";
import { runDailyDigest } from "@/infrastructure/jobs/daily-digest";

// Ежедневный дайджест администратору. Дёргается cron на VM раз в сутки (9:00),
// защита тем же CRON_SECRET, что и воркер очереди (app/api/cron/run-tasks).
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await runDailyDigest(prisma);
  return NextResponse.json({ status: "sent" });
}

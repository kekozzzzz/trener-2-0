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

  // Честный статус: если доставка не удалась (релей/Telegram молчали, resilientFetch не
  // спас), НЕ рапортуем «sent» вслепую — иначе провал дайджеста теряется без следа.
  // safeNotifyAdmin уже залогировал причину; 502 делает провал видимым в логах крона.
  const delivered = await runDailyDigest(prisma);
  return delivered
    ? NextResponse.json({ status: "sent" })
    : NextResponse.json({ status: "failed" }, { status: 502 });
}

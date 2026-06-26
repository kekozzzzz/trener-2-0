import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/client";
import { runSubscriptionReminders } from "@/infrastructure/jobs/subscription-reminders";

// Крон напоминаний о скором конце периода подписки. Дёргается cron на VM (тот же
// CRON_SECRET, что и остальные кроны). Отправляет письма инлайн (safeSendEmail) —
// сбой доставки не роняет прогон, отметка дедупа всё равно ставится.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSubscriptionReminders(prisma);
  return NextResponse.json({ status: "ok", ...result });
}

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/client";
import { runLifecycleEmails } from "@/infrastructure/jobs/lifecycle-emails";

// Крон двух писем-напоминаний игроку («второй турнир бесплатно», «разбор ждёт»).
// Дёргается cron на VM раз в день (тот же CRON_SECRET, что и остальные кроны).
// Письма шлются инлайн (safeSendEmail) — сбой доставки не роняет прогон.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runLifecycleEmails(prisma);
  return NextResponse.json({ status: "ok", ...result });
}

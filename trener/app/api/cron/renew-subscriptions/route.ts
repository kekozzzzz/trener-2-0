import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/client";
import { runSubscriptionRenewals } from "@/infrastructure/jobs/renew-subscriptions";

// Биллинг-крон: ставит задачи автопродления и гасит просроченные подписки. Дёргается
// cron на VM (тот же CRON_SECRET, что и воркер очереди). Само списание выполняет воркер
// run-tasks, обрабатывая поставленные здесь задачи RENEW_SUBSCRIPTION.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runSubscriptionRenewals(prisma);
  return NextResponse.json({ status: "ok", ...result });
}

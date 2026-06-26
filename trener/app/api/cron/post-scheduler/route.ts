import { NextRequest, NextResponse } from "next/server";
import { runScheduler } from "@/infrastructure/posting/service";

// Планировщик автопостинга. Внешний cron на проде дёргает этот маршрут раз в ~15 мин
// (тот же механизм и защита `Authorization: Bearer CRON_SECRET`, что у run-tasks).
// За проход: разослать готовые превью на одобрение и опубликовать одобренное.
let isRunning = false;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (isRunning) {
    return NextResponse.json({ status: "busy" }, { status: 429 });
  }

  isRunning = true;
  try {
    const result = await runScheduler();
    return NextResponse.json({ status: "done", ...result });
  } finally {
    isRunning = false;
  }
}

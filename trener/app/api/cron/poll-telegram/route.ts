import { NextRequest, NextResponse } from "next/server";
import { pollTelegramOnce } from "@/infrastructure/posting/poll";

// Опрос Telegram (getUpdates) — приём нажатий ✅/✏️ и входящих сообщений, когда вебхук
// недоступен (Telegram не достукивается до релея КЗ входящим). Внешний cron на проде
// дёргает этот маршрут раз в минуту. Защита — тот же `Authorization: Bearer CRON_SECRET`,
// что у остальных кронов. isRunning гасит наложение проходов.
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
    const result = await pollTelegramOnce();
    return NextResponse.json({ status: "done", ...result });
  } finally {
    isRunning = false;
  }
}

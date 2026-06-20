import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/client";
import { runWorkerOnce, reapStuckTasks } from "@/infrastructure/queue";

// In-process блокировка: не даёт двум параллельным запросам к одному процессу
// запустить воркер одновременно. Для multi-instance деплоя заменить на
// PostgreSQL advisory lock (pg_try_advisory_lock) или Redis SETNX.
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
  let total = 0;

  try {
    // Перед сливом очереди вернём в работу осиротевшие PROCESSING — задачи,
    // на которых прошлый прогон оборвался (напр. рестарт процесса).
    await reapStuckTasks(prisma);

    // Гоняем воркер в цикле пока есть что делать.
    let result;
    do {
      result = await runWorkerOnce(prisma);
      total += result.tasksProcessed;
    } while (result.tasksProcessed > 0);

    return NextResponse.json({ status: "done", tasksProcessed: total });
  } finally {
    isRunning = false;
  }
}

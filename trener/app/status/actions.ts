"use server";

import { prisma } from "@/infrastructure/db/client";
import { runWorkerOnce, reapStuckTasks } from "@/infrastructure/queue";
import { getSession } from "@/features/auth/session";

let isRunning = false;

export async function triggerWorkerAction(): Promise<{ ok: boolean; tasksProcessed?: number }> {
  // Прогон очереди — только для вошедшего игрока (architecture/07-безопасность.md,
  // раздел 2). Чужих данных не отдаёт, но не даём анониму дёргать конвейер.
  if (!(await getSession())) return { ok: false };

  if (isRunning) return { ok: false };

  isRunning = true;
  let total = 0;

  try {
    // Вернуть в работу осиротевшие PROCESSING перед прогоном (см. cron/run-tasks).
    await reapStuckTasks(prisma);

    let result;
    do {
      result = await runWorkerOnce(prisma);
      total += result.tasksProcessed;
    } while (result.tasksProcessed > 0);

    return { ok: true, tasksProcessed: total };
  } finally {
    isRunning = false;
  }
}

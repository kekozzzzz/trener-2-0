"use server";

import { prisma } from "@/infrastructure/db/client";
import { runWorkerOnce } from "@/infrastructure/queue";

let isRunning = false;

export async function triggerWorkerAction(): Promise<{ ok: boolean; tasksProcessed?: number }> {
  if (isRunning) return { ok: false };

  isRunning = true;
  let total = 0;

  try {
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

"use server";

import { prisma } from "@/infrastructure/db/client";
import { kickWorker } from "@/infrastructure/queue";
import { getSession } from "@/features/auth/session";

export async function triggerWorkerAction(): Promise<{ ok: boolean }> {
  // Прогон очереди — только для вошедшего игрока (architecture/07-безопасность.md,
  // раздел 2). Чужих данных не отдаёт, но не даём анониму дёргать конвейер.
  if (!(await getSession())) return { ok: false };

  // Общий single-flight-прогон (infrastructure/queue/kick.ts): reap + параллельный
  // разгреб, без второго прогона поверх уже идущего. Дожидаемся — кнопка на
  // дев-странице ожидания показывает результат после завершения.
  await kickWorker(prisma);
  return { ok: true };
}

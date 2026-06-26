import type { PrismaClient } from "@prisma/client";
import type { NotifyPort } from "@/infrastructure/adapters/notify";
import type { LlmPort } from "@/infrastructure/adapters/llm";
import { getQueueStuckThresholdMs } from "@/config/notify";
import { getHealthCheckTimeoutMs } from "@/config/health";

// Сводка здоровья для внешнего монитора. Наружу отдаём только эти имена и ok/fail:
// ни секретов, ни бизнес-чисел (эндпоинт публичный). status "down" → роут отдаёт 503.
// Монитор роняют только КРИТИЧНЫЕ проверки (база + воркер); telegram и claude —
// справочные (см. вычисление status ниже).
export type CheckStatus = "ok" | "fail";
export type HealthChecks = { db: CheckStatus; telegram: CheckStatus; claude: CheckStatus; worker: CheckStatus };
export type HealthResult = { status: "ok" | "down"; checks: HealthChecks; ts: string };

export type HealthDeps = { db: PrismaClient; notify: NotifyPort; llm: LlmPort };

// Ограничивает проверку по времени: зависший релей/база — это нездоровье, а не повод
// держать ответ открытым. Таймер чистим при любом исходе, чтобы не плодить хендлы.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("timeout")), ms);
  });
  return Promise.race([promise.finally(() => clearTimeout(timer)), timeout]);
}

// Любой бросок/таймаут/false → "fail". Проверки независимы: падение одной не роняет остальные.
async function check(fn: () => Promise<boolean>, ms: number): Promise<CheckStatus> {
  try {
    return (await withTimeout(fn(), ms)) ? "ok" : "fail";
  } catch {
    return "fail";
  }
}

// Воркер жив, если нет PENDING-задач, чьё время запуска прошло раньше порога «зависания»
// (та же логика, что в дайджесте) — значит очередь разгребается.
async function isWorkerHealthy(db: PrismaClient): Promise<boolean> {
  const stuckBefore = new Date(Date.now() - getQueueStuckThresholdMs());
  const stuck = await db.task.count({ where: { status: "PENDING", runAfter: { lt: stuckBefore } } });
  return stuck === 0;
}

export async function runHealthCheck(deps: HealthDeps): Promise<HealthResult> {
  const ms = getHealthCheckTimeoutMs();

  const [db, telegram, claude, worker] = await Promise.all([
    check(async () => {
      await deps.db.$queryRaw`SELECT 1`;
      return true;
    }, ms),
    check(() => deps.notify.ping(), ms),
    check(() => deps.llm.ping(), ms),
    check(() => isWorkerHealthy(deps.db), ms),
  ]);

  const checks: HealthChecks = { db, telegram, claude, worker };
  // Внешний монитор отражает «могут ли люди пользоваться сайтом» = база (данные) +
  // воркер (очередь разгребается). claude и telegram ходят через релей и могут кратко
  // затупить по сети, не влияя на доступность сайта, — оставляем их в теле как справку,
  // но они НЕ роняют монитор (за реальными их сбоями следит бот-сторож и очередь),
  // иначе единичная икота релея даёт ложную тревогу.
  const status = db === "ok" && worker === "ok" ? "ok" : "down";
  return { status, checks, ts: new Date().toISOString() };
}

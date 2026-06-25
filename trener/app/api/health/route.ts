import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/client";
import { getNotifyAdapter } from "@/infrastructure/adapters/notify";
import { getLlmAdapter } from "@/infrastructure/adapters/llm";
import { getHealthCacheTtlMs } from "@/config/health";
import { runHealthCheck, type HealthResult } from "@/infrastructure/health/run-health-check";

// Публичный health-эндпоинт для ВНЕШНЕГО монитора (UptimeRobot и т.п.): он дёргает его
// снаружи и бьёт тревогу, когда ответ не 200 или его нет вовсе. Так сторож не зависит
// от того, за чем следит — релей/VM/приложение могут лежать, и монитор это увидит.
// Тело — только имена проверок и ok/fail (см. run-health-check): наружу ни секретов,
// ни бизнес-чисел. Кэш на TTL + дедуп параллельных запросов: частый опрос или несколько
// мониторов не множат исходящие проверки к релею.
export const dynamic = "force-dynamic";

let cache: { at: number; result: HealthResult } | null = null;
let inFlight: Promise<HealthResult> | null = null;

async function getHealth(): Promise<HealthResult> {
  const ttl = getHealthCacheTtlMs();
  if (cache && Date.now() - cache.at < ttl) return cache.result;
  if (inFlight) return inFlight;

  inFlight = runHealthCheck({ db: prisma, notify: getNotifyAdapter(), llm: getLlmAdapter() })
    .then((result) => {
      cache = { at: Date.now(), result };
      return result;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

export async function GET(): Promise<NextResponse> {
  const result = await getHealth();
  return NextResponse.json(result, {
    status: result.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

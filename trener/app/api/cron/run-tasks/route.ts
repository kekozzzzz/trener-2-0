import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/client";
import { kickWorker, reapStuckTasks, requeuePoisonedAnalyses } from "@/infrastructure/queue";

// Крон-страховка: будит воркер раз в ~15с на случай, если фоновый «пинок»
// (kickWorker из server actions) по какой-то причине не сработал.
//
// Жнеца зовём ЗДЕСЬ, независимо от прогона. Внутри loop() (kick.ts) reap заперт
// single-flight: если один лейн завис, прогон не завершается, `active` не обнуляется, и
// reap внутри него больше не запускается — осиротевшую задачу некому подобрать. Отдельный
// вызов на каждом тике это чинит: reap — идемпотентный updateMany с порогом 10 мин, живую
// работу не трогает (ничего столько не длится, все сетевые вызовы под таймаутом). kickWorker
// НЕ ждём (void): если прогон завис, тик не должен на нём блокироваться — reap уже отработал.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await reapStuckTasks(prisma);
  // Карантинные разборы раздач возвращаем в очередь спустя паузу (config/queue.ts): брак
  // содержания часто вероятностный, и заход спустя время проходит сам. Идемпотентно и дёшево —
  // updateMany по индексу, обычно 0 строк. Обещание «вернёмся к ней позже» на странице раздачи
  // держится именно на этом вызове.
  await requeuePoisonedAnalyses(prisma);
  void kickWorker(prisma);
  return NextResponse.json({ status: "done" });
}

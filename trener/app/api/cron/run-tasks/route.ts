import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/client";
import { kickWorker } from "@/infrastructure/queue";

// Крон-страховка: будит воркер раз в ~15с на случай, если фоновый «пинок»
// (kickWorker из server actions) по какой-то причине не сработал. Прогон очереди —
// общий single-flight (infrastructure/queue/kick.ts): он сам делает reap осиротевших
// PROCESSING, разгребает очередь параллельно (config/queue.ts) и не запускает второй
// прогон поверх уже идущего. Поэтому отдельный in-process замок здесь больше не нужен.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await kickWorker(prisma);
  return NextResponse.json({ status: "done" });
}

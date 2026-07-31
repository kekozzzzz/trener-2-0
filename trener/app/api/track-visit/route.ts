import { NextResponse } from "next/server";
import { prisma } from "@/infrastructure/db/client";
import { isBotUserAgent } from "@/config/acquisition-sources";

// Маячок общего счётчика заходов на сайт (не только через меченые /go-ссылки):
// components/site-visit-tracker.tsx стучится сюда один раз при монтировании
// корневого layout. Ботов, не выполняющих JS, это уже отсекает само по себе;
// isBotUserAgent — вторая линия защиты для тех немногих, что JS выполняют.
// Учёт — вторичная запись, ошибка БД глушится (как в app/go/[code]/route.ts).
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  if (!isBotUserAgent(req.headers.get("user-agent"))) {
    try {
      await prisma.siteVisit.create({ data: {} });
    } catch (err) {
      console.error("site-visit: не удалось записать заход", err);
    }
  }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

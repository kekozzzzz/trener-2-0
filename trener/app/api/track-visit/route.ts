import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/infrastructure/db/client";
import { isBotUserAgent } from "@/config/acquisition-sources";
import { SITE_VISIT_COOKIE, getSiteVisitSessionMinutes } from "@/config/site-visits";

// Маячок общего счётчика заходов на сайт (не только через меченые /go-ссылки):
// components/site-visit-tracker.tsx стучится сюда один раз при монтировании
// корневого layout. Ботов, не выполняющих JS, это уже отсекает само по себе;
// isBotUserAgent — вторая линия защиты для тех немногих, что JS выполняют.
// Дедуп «сессии» курткой: пока кука жива — повторный заход (F5, переход между
// вкладками) не плодит новые строки, иначе счётчик врёт при каждом обновлении.
// Учёт — вторичная запись, ошибка БД глушится (как в app/go/[code]/route.ts).
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse> {
  const jar = await cookies();
  const alreadyCounted = Boolean(jar.get(SITE_VISIT_COOKIE));

  if (!alreadyCounted && !isBotUserAgent(req.headers.get("user-agent"))) {
    try {
      await prisma.siteVisit.create({ data: {} });
    } catch (err) {
      console.error("site-visit: не удалось записать заход", err);
    }
  }

  jar.set(SITE_VISIT_COOKIE, "1", {
    maxAge: 60 * getSiteVisitSessionMinutes(),
    path: "/",
    sameSite: "lax",
  });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}

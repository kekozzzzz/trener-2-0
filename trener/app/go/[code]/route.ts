import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/infrastructure/db/client";
import { getAppBaseUrl } from "@/config/app";
import {
  findAcquisitionSourceByCode,
  ACQUISITION_COOKIE,
  ACQUISITION_COOKIE_MAX_AGE_DAYS,
} from "@/config/acquisition-sources";

export const dynamic = "force-dynamic";

// Меченая ссылка для постов на внешних площадках (GipsyTeam, Telegram, ...):
// /go/<code> → редирект на главную. `code` нарочно не похож на источник (config/
// acquisition-sources.ts) — по ссылке в посте не должно быть видно, куда она ведёт.
// Неизвестный код просто редиректит без счётчика (опечатка не должна давать 404
// живому человеку). Первое касание: cookie ставится только если её ещё нет —
// повторный переход по другой ссылке не переписывает уже отданный источник.
// Учёт захода — вторичная запись, ошибка БД глушится (как в features/auth/auth-events.ts).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<NextResponse> {
  const { code } = await params;
  const known = findAcquisitionSourceByCode(code);

  if (known) {
    const jar = await cookies();
    if (!jar.get(ACQUISITION_COOKIE)) {
      jar.set(ACQUISITION_COOKIE, known.slug, {
        maxAge: 60 * 60 * 24 * ACQUISITION_COOKIE_MAX_AGE_DAYS,
        path: "/",
        sameSite: "lax",
      });
    }
    try {
      await prisma.landingVisit.create({ data: { source: known.slug } });
    } catch (err) {
      console.error("acquisition: не удалось записать заход", known.slug, err);
    }
  }

  return NextResponse.redirect(getAppBaseUrl(), { status: 302 });
}

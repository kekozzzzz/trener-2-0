// Журнал событий входа (auth_events): регистрация, успешный вход (пароль/ссылка),
// неудачная попытка входа — последнее предписано architecture/07-безопасность.md
// (раздел 2, «неудачные попытки входа — в журнал»). Питает админ-статистику /admin:
// «сколько регистраций и входов сегодня, из каких стран, из каких источников».
//
// Приватность: сохраняется только ISO-код страны, определённый по IP локальным
// справочником (features/auth/geo.ts); сам IP-адрес в базу НЕ пишется.
//
// Не "use server": обычная серверная функция, вызывается из server actions и
// route handler'а входа. На клиент не попадает.

import type { AuthEventKind } from "@prisma/client";
import { cookies } from "next/headers";
import { prisma } from "@/infrastructure/db/client";
import { clientIp } from "./rate-limit";
import { countryFromIp } from "./geo";
import { ACQUISITION_COOKIE } from "@/config/acquisition-sources";

// Источник перехода из cookie первого касания; вне HTTP-контекста (как и
// clientIp в rate-limit.ts) — просто null, не мешает записать остальное событие.
async function acquisitionSourceFromCookie(): Promise<string | null> {
  try {
    return (await cookies()).get(ACQUISITION_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

// Записать одно событие. Журнал вторичен: любая ошибка (БД, заголовки, гео)
// глушится с логом — вход или регистрация из-за журнала сломаться не могут.
export async function recordAuthEvent(
  kind: AuthEventKind,
  playerId: string | null,
): Promise<void> {
  try {
    const country = countryFromIp(await clientIp());
    // Источник перехода привязываем только к регистрации — для входов он не имеет смысла.
    const utmSource = kind === "REGISTER" ? await acquisitionSourceFromCookie() : null;
    await prisma.authEvent.create({ data: { kind, playerId, country, utmSource } });
  } catch (err) {
    console.error("auth-events: не удалось записать событие", kind, err);
  }
}

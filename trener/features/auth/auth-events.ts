// Журнал событий входа (auth_events): регистрация, успешный вход (пароль/ссылка),
// неудачная попытка входа — последнее предписано architecture/07-безопасность.md
// (раздел 2, «неудачные попытки входа — в журнал»). Питает админ-статистику /admin:
// «сколько регистраций и входов сегодня, из каких стран».
//
// Приватность: сохраняется только ISO-код страны, определённый по IP локальным
// справочником (features/auth/geo.ts); сам IP-адрес в базу НЕ пишется.
//
// Не "use server": обычная серверная функция, вызывается из server actions и
// route handler'а входа. На клиент не попадает.

import type { AuthEventKind } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";
import { clientIp } from "./rate-limit";
import { countryFromIp } from "./geo";

// Записать одно событие. Журнал вторичен: любая ошибка (БД, заголовки, гео)
// глушится с логом — вход или регистрация из-за журнала сломаться не могут.
export async function recordAuthEvent(
  kind: AuthEventKind,
  playerId: string | null,
): Promise<void> {
  try {
    const country = countryFromIp(await clientIp());
    await prisma.authEvent.create({ data: { kind, playerId, country } });
  } catch (err) {
    console.error("auth-events: не удалось записать событие", kind, err);
  }
}

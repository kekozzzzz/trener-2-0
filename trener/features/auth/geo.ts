// Страна по IP — локальный справочник geoip-country (данные GeoLite2 лежат внутри
// пакета, сетевых запросов НЕТ: IP-адрес никуда не отправляется и нигде не
// сохраняется, наружу выходит только ISO-код страны). Пакет объявлен внешним в
// next.config.ts (serverExternalPackages) — его базу нельзя бандлить.
// plans/2026-07-02-админ-статистика.md
import { lookup } from "geoip-country";

// ISO-код страны («RU») по IP или null: пустой/служебный/нераспознанный адрес.
// Никогда не бросает — журнал входов вторичен и не должен ломать сам вход.
export function countryFromIp(ip: string | null | undefined): string | null {
  if (!ip || ip === "unknown") return null;
  try {
    return lookup(ip)?.country ?? null;
  } catch {
    return null;
  }
}

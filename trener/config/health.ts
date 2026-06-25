// Конфигурация health-проверки (/api/health) — TTL кэша и таймаут одной проверки
// живут здесь и в .env (правило проекта №3: лимиты в конфиге, не в коде).

const DEFAULT_CACHE_TTL_MS = 60_000; // не дёргаем релей чаще раза в минуту даже при частом опросе
const DEFAULT_TIMEOUT_MS = 8_000; // одна проверка не должна подвешивать ответ дольше этого

// Сколько держать результат проверки в памяти процесса. Несколько мониторов или
// частый опрос не множат исходящие проверки. 0 — кэш выключен (каждый запрос свежий).
export function getHealthCacheTtlMs(): number {
  const raw = Number(process.env.HEALTH_CACHE_TTL_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_CACHE_TTL_MS;
}

// Предел ожидания одной проверки (база/telegram/claude/worker). Превышение = «fail»:
// зависший релей или база — это и есть нездоровье, ответ не должен висеть.
export function getHealthCheckTimeoutMs(): number {
  const raw = Number(process.env.HEALTH_CHECK_TIMEOUT_MS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
}

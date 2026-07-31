// Конфигурация общего счётчика заходов на сайт (SiteVisitTracker + app/api/track-visit).
// Правило проекта №3: лимиты в конфиге, не в коде.

// Кука «сессии»: пока жива — повторные заходы (обновление страницы F5, переход
// между вкладками) НЕ считаются новым заходом. Истекла — следующий заход снова
// пишется как новый. 30 минут — обычное окно «сессии» в веб-аналитике.
export const SITE_VISIT_COOKIE = "wg_visit_seen";

export function getSiteVisitSessionMinutes(): number {
  const raw = Number(process.env.SITE_VISIT_SESSION_MINUTES);
  return Number.isFinite(raw) && raw > 0 ? raw : 30;
}

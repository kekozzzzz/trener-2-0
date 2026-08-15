// Именованные источники трафика для меченых ссылок (/go/<code>, admin/page.tsx).
// Список меняется по ходу дела (правило 3 — не в коде бизнес-логики, а в конфиге):
// новый источник — новая строка здесь.
//
// `code` — то, что видно в самой ссылке. Нарочно не совпадает со `slug`/`label`:
// человек, глядя на ссылку в посте на форуме, не должен догадаться, что это
// «ссылка для GipsyTeam» — иначе смысл метки теряется. Новый код — любые 6 цифр
// без очевидного порядка (не 1, 2, 3...), проверить на уникальность в списке ниже.
// `slug` — внутреннее имя (в БД, в /admin), `label` — подпись в /admin.

export type AcquisitionSource = { code: string; slug: string; label: string };

export const ACQUISITION_SOURCES: AcquisitionSource[] = [
  { code: "294817", slug: "gipsyteam", label: "GipsyTeam" },
  { code: "630452", slug: "telegram", label: "Telegram" },
  { code: "759042", slug: "instagram", label: "Instagram" },
  { code: "406738", slug: "youtube", label: "YouTube" },
  { code: "618930", slug: "tiktok", label: "TikTok" },
];

export function findAcquisitionSourceByCode(code: string): AcquisitionSource | undefined {
  return ACQUISITION_SOURCES.find((s) => s.code === code);
}

// Cookie первого касания: ставится один раз при первом переходе по /go/<code>,
// регистрация читает её и привязывает источник к auth_events.utm_source.
export const ACQUISITION_COOKIE = "wg_src";
export const ACQUISITION_COOKIE_MAX_AGE_DAYS = 90;

// Краулеры-превьюшники соцсетей/мессенджеров (Instagram/Facebook, Telegram, ...)
// сами обходят ссылку, как только её вставляют в профиль/сообщение — это не заход
// живого человека, а генерация карточки-превью. Такие User-Agent не считаем и не
// ставим им cookie источника, иначе счётчик в /admin врёт с первой же минуты.
const BOT_USER_AGENT_PATTERN =
  /bot|facebookexternalhit|facebot|telegrambot|twitterbot|slackbot|whatsapp|discordbot|linkedinbot|skypeuripreview|vkshare|pinterest|redditbot|preview|crawler|spider/i;

export function isBotUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return true; // без UA — тоже не живой браузер, не считаем
  return BOT_USER_AGENT_PATTERN.test(userAgent);
}

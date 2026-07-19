---
name: project_seo_metadata
description: "SEO/метаданные whygrid.app — robots/sitemap/noindex + Search Console заведён, иконка (svg+png) задеплоена; история ниже"
metadata: 
  node_type: memory
  type: project
  originSessionId: ec05a353-d9cb-45bb-9966-5d89644faf91
---

**СТАТУС 2026-06-29: ЗАДЕПЛОЕНО НА ПРОД, НЕ ПЕРЕДЕЛЫВАТЬ** (метаданные/robots/sitemap/иконка в проде, сверено). ОТКРЫТО только: тексты описаний — placeholder, ждут правок Артёма; og-картинка для шеринга не сделана; favicon-смена в выдаче Google идёт неделями. Ниже — история.

2026-06-23 (история): настроены метаданные сайта (раньше был только `title: "Whygrid"`).
Сделано в коде: корневой [[trener/app/layout.tsx]] — metadataBase + title.default/template «%s — Whygrid» + description главной + openGraph; описания на /pricing и /legal; `lib/seo.ts` экспортирует `noindex`; приватные страницы (account, analyze, login, register, forgot/reset-password, status, tournaments, design-preview, tournament/* через layout) получили `export const metadata = noindex`; добавлены `app/robots.ts` (allow /, disallow /api/, sitemap+host) и `app/sitemap.ts` (только /, /pricing, /legal). tsc+build зелёные.

**Why:** в Google вылезала каша «ТарифыВойтиРегистрация…» (Google скрёб текст сам), не было favicon, индексировались приватные страницы. Решение Артёма: в поиске оставить только лендинг+юр-страницы, остальное скрыть.

2026-06-23 добавлено: favicon `trener/app/icon.svg` (знак «grid» на тёмной плитке) + знак вкручен в `<Wordmark/>` (см. [[project_naming_branding]]); описание главной слегка отполировано (Артём одобрил первый вариант). Сборка зелёная, прод-сервер прогнан — шапка с лого и иконка вкладки ок.

2026-06-23 модель индексации перевёрнута на «БЕЛЫЙ СПИСОК»: в корневом layout robots по умолчанию `index:false` — любая НОВАЯ страница сама НЕ лезет в Google. Открыты точечно только лендинг/тарифы/правовая через `indexable` из lib/seo.ts (там же `noindex` для явного закрытия приватных). Проверено на проде-сборке: /, /pricing, /legal = index; /login и пр. = noindex.

**2026-06-25 — поиск разобран (ЗАДЕПЛОЕНО/настроено):**
- **Google Search Console**: ресурс https://whygrid.app/ ПОДТВЕРЖДЁН (метод HTML-файл `public/google2d4c76d01769360a.html`; файл в репо + был подложен на VM вручную, т.к. GitHub из РФ лежал). Sitemap отправлена → «Успешно», 3 страницы. Removals: префикс `https://whygrid.app/legal/` (временное удаление мёртвых юр-подстраниц).
- **Иконка готова**: добавлен растровый `trener/app/icon.png` 192×192 (тот же знак, отрендерен из icon.svg) — Google в выдаче капризен к SVG. На проде LIVE: /icon.png=200, в `<head>` главной `<link rel=icon ... png 192x192>`. В самой выдаче Google favicon сменится с глобуса не сразу (дни-недели).
- **Мёртвые юр-URL**: /legal/{privacy,oferta,refund,requisites} (404 после сведения юр-раздела в одну /legal) → добавлены 301-редиректы на /legal в `next.config.ts` (коммит 5c96764). Приватные страницы (login/account/разборы) в индексе НЕ висят — noindex сработал.

**How to apply:** добавляешь публичную страницу, которую ХОЧЕШЬ в Google → повесь `export const metadata = { ...indexable }` и добавь URL в app/sitemap.ts. Ничего не делаешь → страница скрыта от поиска автоматически. После деплоя Google обновляет выдачу за дни-недели. og-картинка для шеринга пока НЕ сделана. Деплой по явной команде Артёма. (С 2026-07-19 предпочитать `indexablePage("/путь")` вместо голого `indexable` — добавляет canonical.)

**2026-07-19 — canonical (в ветке claude/search-visibility-drop, НЕ задеплоено):** Артём: в Google по имени/домену whygrid.app не находит, по полному `https://whygrid.app` — находит. Причина не в коде-регрессе (robots/sitemap/noindex/middleware/next.config чисты), а в том, что тега `<link rel="canonical">` НЕ БЫЛО вообще — Next сам его не ставит, только metadataBase. Без canonical Google размывает сигналы между http/https/www-дублями. Фикс: добавлен `indexablePage(path)` в lib/seo.ts (robots + `alternates.canonical`), проставлен на /, /pricing, /legal, /charts, /how-to-export; /how-to-export дозакинут в sitemap. Билд зелёный. **Осталось за Артёмом (из облака недоступно):** Search Console → «Индексирование страниц» (статус главной + нет ли ручных мер); после деплоя переотправить sitemap. Прод из облака не открыть — прокси среды блокирует whygrid.app.

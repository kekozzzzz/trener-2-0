---
name: project_scroll_highlight_feature
description: "Сканирующая подсветка при скролле — LIVE на главной (design-system.md §4.1 п.14), компонент components/site/scroll-glow.tsx"
metadata: 
  node_type: memory
  type: project
  originSessionId: e801d8f0-e666-4dcb-98c3-c2dee08d4753
  modified: 2026-08-18T13:48:28.751Z
---

Полоса чуть ниже статус-строки «сканирует» страницу: текст/блок с атрибутом `data-glow`, проезжая через неё, подсвечивается, уезжает — гаснет. Два уровня, назначаются осознанно по месту (не «через один»):
- **soft** (по умолчанию) — только аура (`box-shadow`), для второстепенного содержимого (пример, иллюстрация).
- **strong** (`data-tier="strong"`) — рамка + заголовок загораются лаймом, для цифр-доказательств.

Механизм — `components/site/scroll-glow.tsx`, один экземпляр в корневом layout. Прямой расчёт позиции на каждом кадре скролла (`requestAnimationFrame` + `getBoundingClientRect`), НЕ `IntersectionObserver` — см. [[reference_scroll_zone_intersectionobserver_unreliable]], первая версия на Observer была ненадёжна и переписана 18.08.2026.

Переиспользуемый проп `scrollGlow?: "soft" | "strong"` есть на `Tilt`, `BentoCell`, `Tile`, `ProductWindow`, `StatRow` (`components/site/detail.tsx`) — подключить на новом месте просто.

**Why:** заказ Артёма 18.08.2026, одобрено по прототипу `design/scroll-highlight-preview.html` перед переносом в продукт.

**How to apply:** сейчас подключено только на главной (`app/page.tsx`). Если Артём попросит расширить на другие страницы (`/about`, `/charts`, `/pricing` и т.д.) — механизм уже готов, нужно только расставить `scrollGlow`/`data-glow` по месту, без доработки самого компонента.

Заодно 18.08.2026 убраны два статичных световых пятна фона (`backdrop-glow-tr`/`backdrop-glow-bl` в `components/site/backdrop.tsx`) — конфликтовали с новым эффектом визуально, Артём поймал сразу.

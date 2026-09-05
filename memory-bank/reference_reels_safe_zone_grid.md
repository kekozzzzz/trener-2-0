---
name: reference_reels_safe_zone_grid
description: "Найденные в интернете точные пиксельные safe-zone для Instagram Reels/TikTok/YouTube Shorts на 1080x1920 — подтверждают и дополняют ранее откалиброванный по скрину Артёма safe zone [219,1532]"
metadata:
  node_type: memory
  type: reference
  originSessionId: 71ac42ab-5e16-41bb-960a-fe47d19f63e7
  modified: 2026-09-04T15:35:23.647Z
---

Артём (2026-09-04) попросил найти в интернете готовые сетки/гайды по расположению текста в
вертикальном видео вместо того, чтобы подбирать зоны на глаз. Нашёл через WebSearch/WebFetch
(reelsafezone.com, jonloomer.com, careerfoundry — rule of thirds) точные цифры для 1080×1920:

**Instagram Reels:** верх 220px, низ 280px, правая колонка (лайк/коммент/шер) 160px.
**TikTok:** верх 180px, низ 320px, правая колонка 160px (продукт сейчас не постит в TikTok,
см. [[project_marketing]] — цифра про запас, не актуальна прямо сейчас).
**YouTube Shorts:** верх 160px, низ 260px, правая колонка 140px, левый отступ 40px.

**Как это соотносится с уже использовавшимся в проекте safe zone [219,1532]:** верхняя граница
почти идеально совпадает (219 vs 220 — расхождение в 1px, это разные источники сошлись
независимо). Нижняя граница в проекте КОНСЕРВАТИВНЕЕ (1532, то есть 388px снизу) чем общие
цифры (280px = 1640) — это ок, старый расчёт был откалиброван по РЕАЛЬНОМУ скрину интерфейса
Reels от Артёма, более узкая (безопасная) граница не проблема.

**Находка, которую раньше не учитывали:** правая колонка иконок (лайк/коммент/шер) занимает
~160-245px справа ИМЕННО В НИЖНЕЙ ТРЕТИ кадра (не по всей высоте). В компоненте
`PhraseBeat.tsx` right-колонка split-раскладки стоит на `FRAME_W - SAFE_MARGIN_X` (=1024 из
1080) — это НАПРЯМУЮ попадает в зону риска, если split-фраза окажется в нижней трети. Фикс
внедрён в reel-your-stakes (см. [[project_reel_your_stakes]]): split-layout (не punch/impact —
тот всегда по центру) исключает нижнюю вертикальную зону из ротации.

**Прямую PNG-плашку скачать не удалось** — генерируется JS на клиенте (canvas), не статический
файл, WebFetch не даёт download-ссылку. Понадобится точная визуальная плашка снова — тот же
путь, что уже сработал раньше (см. [[project_remotion_motion_graphics_skill]]): попросить
Артёма прислать скриншот реального интерфейса, разобрать покадрово.

**How to apply:** при появлении НОВОЙ платформы дистрибуции (не Reels/Shorts) — искать её
конкретные safe-zone цифры тем же способом (WebSearch + reelsafezone.com/аналоги) вместо
угадывания на глаз. Держать в уме: right-колонка иконок — риск только в НИЖНЕЙ трети кадра, не
по всей высоте.

Sources:
- [Instagram Safe Zone Checker & Free Overlay PNG Download](https://reelsafezone.com/)
- [TikTok, Instagram Reels, Facebook Reels, and YouTube Shorts Safe Zones](https://www.jonloomer.com/tiktok-instagram-reels-safe-zones-templates/)
- [Rule of Thirds in Design: 11 Great Examples](https://careerfoundry.com/en/blog/ux-design/what-is-the-rule-of-thirds/)

---
name: project_pokerplanets_parser
description: "Новый рум PokerPlanets — клон формата PokerStars; подключён в PS-семью правкой шапки; собран+протестирован, деплой ждёт команды"
metadata: 
  node_type: memory
  type: project
  originSessionId: 04415f9f-4d03-4301-ad13-0fe830c35722
---

**PokerPlanets** — новый рум, всплыл 2026-07-12 через сторож diagnose (алерт «формат не распознан» в Telegram Ygrid). Образец вытащен из S3 (`unrecognized/2026-07-12/e18cc34b…txt`, 138 КБ, 90 раздач) через релей-jump → прод-БД `unrecognized_uploads` (read-only) → GetObject тем же SDK, что storage-адаптер; лежит локально в `Test/samples/pokerplanets/` (вне git, Правило 5).

Оказался **клоном формата PokerStars** — тело раздачи идентично (те же `*** HOLE CARDS/FLOP/SUMMARY ***`, `Dealt to`, `raises X to Y`, `collected X from pot`, `Uncalled bet`, вскрытие). Подключён в PS-семью (как Chico) правкой ТОЛЬКО шапки в [parser/ps/index.ts] и [parser/index.ts]:
- имя рума `PokerPlanets` (гейты `HAND_HEADER/HAND_SPLIT/HAND_ID` расширены `(?:PokerStars|PokerPlanets)`);
- турнир записан `Tournament (Название)#id` вместо `Tournament #id` → `TOURNAMENT_META` = `/Tournament (?:#|\(.+?\)#)(\d+), (.+?) - Level/`; `PS_HEADER` накрывает обе формы `Tournament [#(]`; добавлен `POKERPLANETS_KEY` для склейки многостольных файлов;
- **UTF-8 BOM** в начале файла — срезаем `.replace(/^﻿/, "")` в роутере, ps-парсере и sniff (иначе `^` не бьёт первую раздачу);
- `detectRoom` метит "PokerPlanets" по шапке.

Сверка на реальном образце: room/id/дата верны, 90 раздач, VPIP 31.1 / PFR 22.2 (PFR<VPIP), AF 3, результат +7.84 бай-ина, **`diagnoseParse` = null** (сторож молчит). Тест `парсит PokerPlanets` в ps.test.ts (синтетический, с BOM); весь прогон 445/0, tsc чист.

⚠️ **Каветат:** рум сам обезличивает оппонентов как `PlayerN` ПО МЕСТУ. Профилирование оппонентов через сессию для этого рума деградирует (Player1 за разными столами — разные люди). Метрики ГЕРОЯ (Правило 1) не затронуты.

**Гайд «Как выгрузить руки» (2026-07-12):** PokerPlanets добавлен в `hand-history-guide.tsx` (`HAND_HISTORY_ROOMS`, после PokerStars) + тексты шагов/ext/paths/notes/networkLabels в `messages/ru.json` и `en.json` (5 шагов). Тег «бывший PokerStars Sochi» для узнавания. **БЕЗ скриншотов** (как Chico): клиент закрытый, публичных скринов экрана настройки истории НЕТ нигде (искал трекер-гайды HM3/PT4, обзоры EN/RU, офиц.сайт — пусто; трекеры в руме запрещены). У Артёма доступа к клиенту/тестеру НЕТ → снять скрины сейчас нельзя, шаги написаны честно-обобщённо (без выдуманных лейблов меню). Находки+список нужных кадров: `Test/hh-screens-raw/pokerplanets/sources.md`. Отрендерил вживую /how-to-export RU+EN → 200, тег+шаги на месте, next-intl не падает.

СТАТУС на 2026-07-12: парсер + бейдж рума + гайд (текстом) собраны, tsc/тесты/живой рендер чисты, **НЕ закоммичено и НЕ задеплоено** — ждёт команды Артёма. При деплое: обновить каталог `07-что-умеет-продукт.md` в whygrid-марк (добавить PokerPlanets в список румов). Скрины гайда — когда появится доступ к клиенту. [[project_winamax_888_ps_parsers]] [[project_opponent_profiling]] [[project_upload_guide_screenshots]] [[feedback_marketing_catalog_sync]]

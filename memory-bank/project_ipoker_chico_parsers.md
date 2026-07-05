---
name: project_ipoker_chico_parsers
description: "Парсеры Chico (PS-семья) и iPoker (XML) построены локально — мультирум, не задеплоено"
metadata: 
  node_type: memory
  type: project
  originSessionId: 26848914-17f9-4c83-b980-31f55dffd252
---

Парсеры **Chico** и **iPoker** построены 2026-06-29 (план `plans/2026-06-29-парсеры-ipoker-chico.md`, зонтик [[project_wpn_parser]] / `plans/2026-06-28-мультирум-парсеры-турниры.md`).

- `trener/parser/ps/` — PS-семья (PokerStars + Chico): двоеточные действия (как GG), ники с пробелами (матчим по списку имён из Seat-строк), герой по `Dealt to`, room по префиксу стола `CHC_`→Chico, иначе PokerStars. chipResult построчным учётом.
- `trener/parser/ipoker/` — XML: `<game gamecode>`=раздача, герой=`<nickname>`, турнир=`<tournamentcode>`; **chipResult = win−bet прямо из тегов `<player>`** (даром); карты `<масть><ранг>` (ten `10`→`T`); type-коды 0/1/2/3/4/5/7/15/23; all-in когда суммарный вклад==chips.
- `trener/parser/shared/positions.ts` — общий модуль позиций (GG/WPN намеренно НЕ трогали — деплой стабилен, у них свои копии).
- Роутер `parser/index.ts` + `sniffTournamentKey` (room "PS"/"iPoker" для склейки многостольных файлов) + dash-таймстемп в `merge-files.ts`.
- ⚠️ Реальные экспорты — **CRLF**; нормализуем `\r\n?`→`\n` на входе, иначе `parseVerb` (якорь `$` без флага `m`) не матчит и действия пустые. (grep `-c $'\r'` врёт — проверять через JSON.stringify.)

Статус: тесты `__tests__/parser/ps.test.ts`+`ipoker.test.ts` — 17 зелёных; на реальных файлах (вне git: `Test/samples/Chico/`, `Test/samples/Ipoker/`) VPIP/PFR/позиции/карты правдоподобны. **НЕ закоммичено, НЕ задеплоено.** Осталось: UI/тексты/hardening + покерная приёмка Артёмом на реальном файле каждого рума; PokerKing (ещё WPN-скин) ждёт файла.

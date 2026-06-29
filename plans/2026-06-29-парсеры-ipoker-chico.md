# План: парсеры iPoker и Chico

**Дата:** 2026-06-29
**Зонтик:** `plans/2026-06-28-мультирум-парсеры-турниры.md` (Фазы 3 и хвост). Здесь — два рума: **Chico** (PS-семья) и **iPoker** (XML).

## Что выяснено по реальным файлам (`Test/samples/`, вне git)

### Chico = формат PokerStars
- Заголовок: `PokerStars Hand #N: Tournament #N, $X+$Y USD Hold'em No Limit - Level (sb/bb) - YYYY/MM/DD HH:MM:SS UTC`
- Стол: `Table 'CHC_<id> <n>' 6-max Seat #N is the button` — префикс `CHC_` отличает Chico от настоящего PokerStars.
- Действия **с двоеточием** (как GG): `kekoz: folds`, `koffeein: raises 300 to 420`. НО ники могут содержать пробелы → матчим по списку имён из Seat-строк, не по `\S+`.
- Герой по `Dealt to <ник> [..]`. Анте `posts the ante`, блайнды `posts small blind/ big blind`.
- Борд по улицам раздельно (как GG): `*** TURN *** [..] [x]`. Стек `(N in chips)`. Бай-ин в заголовке → результат в бай-инах.
- chipResult — построчным учётом (как WPN/GG), `collected ... from pot/main pot/side pot-N`, `Uncalled bet`.

### iPoker = XML
- Файл = склейка `<root>…</root>` (один root на стол). В root: `<general>` (мета) + много `<game gamecode="...">` (раздачи).
- Мета: `<nickname>` = **герой**, `<tournamentcode>` = id турнира, `<tournamentname>`, `<tablesize>`, `<buyin>/<totalbuyin>`, `<startdate>`.
- В каждой `<game>`: `<general>` с `smallblind/bigblind/ante` и `<players>` — у `<player seat dealer name chips win bet/>` есть **`win` и `bet`** → **chipResult = win − bet** (даром, без разбора сумм). `dealer="1"` = баттон.
- Раунды: `round no=0` анте/блайнды, `1` префлоп (Pocket+действия), `2/3/4` флоп/тёрн/ривер (`<cards type="Flop">…</cards>`).
- Карты `<масть><ранг>`: `S4`→`4s`, `DQ`→`Qd`, `HA`→`Ah`, `C10`→`Tc` (ten=`10`→`T`).
- Коды действий: `0` fold, `1` SB, `2` BB, `3` call, `4` check, `5` bet, `7` all-in call, `15` ante, `23` raise. `sum` — **инкремент** улицы (для RAISE приводим к абсолюту).
- Олл-ин помечаем, когда суммарный вклад игрока == его `chips`.

## Фазы
- [x] Ф0. Образцы на руках (`Test/samples/Chico/`, `Test/samples/Ipoker/`), обезличенные фикстуры — отдельно.
- [x] Ф1. Общий модуль позиций `parser/shared/positions.ts` (вынос из GG/WPN; старые парсеры не трогаем — деплой стабилен).
- [x] Ф2. PS-семья `parser/ps/` (Chico + задел под настоящий PokerStars): `index.ts` + `hand.ts`. Room по префиксу стола (`CHC_`→Chico, иначе PokerStars).
- [x] Ф3. iPoker `parser/ipoker/`: `index.ts` + `hand.ts` (XML).
- [x] Ф4. Роутер `parser/index.ts`: детект PS-заголовка и iPoker-XML; `sniffTournamentKey` для PS и iPoker (склейка многостольных файлов одного турнира); dash-таймстемп в `merge-files`.
- [x] Ф5. Тесты `__tests__/parser/ps.test.ts`, `ipoker.test.ts` (мета, VPIP/PFR, chipResult, позиции, обезличивание, роутер) + обезличенные фикстуры.
- [ ] Ф6. UI/тексты/hardening + покерная приёмка Артёмом на реальном файле каждого рума (после кода).

## Что нужно от Артёма
- Приёмка: сверить пару раздач (выигрыш/проигрыш фишек) глазами на реальном Chico- и iPoker-файле.
- Решить про PokerKing (ещё один WPN-скин) — нужен файл.

## Журнал
- 2026-06-29 | Chico через PS-семью (room по `CHC_`), iPoker отдельным XML-парсером (chipResult из win−bet) | разбор живых файлов

## Итог
Парсеры Chico (PS-семья) и iPoker (XML) построены и подключены к роутеру.
- `parser/ps/` — PS-формат с двоеточием, ники с пробелами, room по `CHC_` (Chico/PokerStars). chipResult построчно.
- `parser/ipoker/` — XML, chipResult = win−bet из тегов `<player>`, карты `<масть><ранг>`→наш вид, type-коды действий, all-in по вкладу==стек.
- `parser/shared/positions.ts` — общий модуль позиций (GG/WPN не трогали — деплой стабилен).
- Роутер + `sniffTournamentKey` (PS/iPoker) + dash-таймстемп в `merge-files`.
- **Важно:** реальные экспорты идут в **CRLF** — нормализуем `\r\n?`→`\n` на входе (иначе `parseVerb` с якорем `$` без флага `m` не матчит и действия пустые).
- Тесты `ps.test.ts` + `ipoker.test.ts` — 17 зелёных. На реальных файлах VPIP/PFR/позиции/карты правдоподобны (Chico 23/28/91/108 рук; iPoker 56/256 рук), бэд-карт нет.
- НЕ закоммичено, НЕ задеплоено. Осталась Ф6 (UI/тексты/hardening + покерная приёмка Артёмом).
- ⚠️ В рабочем дереве на момент работы 17 тест-файлов и 12 TS-ошибок падают из-за **чужого незакоммиченного WIP** (фича «Твои чарты»/open-chart: переименование `OpenPosition`, `rfi-chart.ts` `tokens is not iterable`) — к парсерам отношения не имеет, мои файлы чистые.

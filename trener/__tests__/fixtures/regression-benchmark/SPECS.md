# SPECS — эталонный регресс-набор, GG-часть (пункты 1-30)

Источник: `plans/2026-07-20-эталон-регресс-раздач.md`. Здесь — точная спецификация каждой
из 30 GG-раздач в `__tests__/fixtures/regression-benchmark/gg/`, чтобы вторая половина
работы (iPoker XML) воспроизвела ТУ ЖЕ логическую раздачу без повторного проектирования
покерной логики.

**Как читать этот файл.** Для каждого пункта: столы/места/стеки, блайнды, карты Hero,
борд по улицам, полная хронология действий с суммами, шоудаун, и — самое важное —
**целевая классификация** (какой канал/детектор должен сработать) вместе с тем, **как
она подтверждена** в GG-версии реальным кодом парсера (`decisionMarks`/`topDecisionMark`
из `parser/decision-weight.ts`, `detectHeroLuckyWin` из `parser/lucky-win.ts`). Твоя задача —
собрать структурно ТУ ЖЕ раздачу (те же места, стеки, карты, порядок действий и суммы) в
формате iPoker XML: одинаковые входные данные обязаны давать один и тот же результат
классификации на РЕАЛЬНОМ парсере iPoker (`parser/ipoker/*`, если он существует — если
нет отдельного iPoker-парсера классификации, ориентир — что `TableSnapshot`, который
получится после парсинга твоего XML, структурно идентичен тому, что описан здесь).

Все 30 раздач сгенерированы, спарсены `parseGGPokerMtt()` (полный роутер) и провалидированы
`decisionMarks`/`topDecisionMark`/`detectHeroLuckyWin` в `__tests__/manual/gen-regress.test.ts`
(временный файл, не в git) — 30/30 тестов зелёные на момент сдачи.

Общие константы, если не сказано иное: уровень блайндов Level5, SB=50, BB=100, анте нет,
стек по умолчанию 5000 фишек (50bb). Название турнира везде "Тестовый турнир". Формат
карт: `<ранг><масть>` (ранги 2-9TJQKA, масти c/d/h/s).

---

## 1. big-fold-preflop — BIG_FOLD на префлопе

Файл: `gg/01-big-fold-preflop.txt`

- Стол: 2-max (heads-up). Seat 1 = Hero (button/SB), Seat 2 = игрок1 (BB). Стеки 5000/5000.
- Блайнды: Hero posts SB 50, игрок1 posts BB 100.
- Карты Hero: `9c 9d` (карманная пара девяток).
- Действия (PREFLOP): Hero raises 250 to 300 → игрок1 raises 2700 to 3000 → Hero folds.
- Флопа не было (борд пуст).
- Итог: Uncalled bet (2700) возвращён игрок1; игрок1 collected 400 from pot.
- **Целевая классификация:** `topDecisionMark(snapshot, chipResult)` → `{channel: "BIG_FOLD", street: "PREFLOP"}`.
  Подтверждено: toCall=2700 (≥ порога 500), Hero вложился ДО фолда (свой рейз), карманная
  пара даёт «hadSomething»=true даже без учёта борда.
- chipResult = **-300**.

## 2. big-fold-flop — BIG_FOLD на флопе

Файл: `gg/02-big-fold-flop.txt`

- Стол: 2-max. Seat1=Hero(SB), Seat2=игрок1(BB). Стеки 5000/5000. SB50/BB100.
- Карты Hero: `Tc Td`.
- PREFLOP: Hero raises 250 to 300 → игрок1 calls 200. Пот 600.
- FLOP `Kd 7s 2c`: игрок1 bets 2500 → Hero folds.
- Uncalled bet (2500) → игрок1; игрок1 collected 600 from pot.
- **Целевая классификация:** BIG_FOLD / FLOP. Hero держит карманных десяток — underpair к
  королю на борде (MID_PAIR, не AIR) → «hadSomething»=true; toCall=2500≥500.
- chipResult = **-300**.

## 3. big-fold-turn — BIG_FOLD на тёрне

Файл: `gg/03-big-fold-turn.txt`

- Те же места/стеки/блайнды/карты Hero (`Tc Td`), что и №2.
- PREFLOP: Hero raises 250 to 300 → игрок1 calls 200 (пот 600).
- FLOP `Kd 7s 2c`: check-check.
- TURN `9h`: игрок1 bets 2500 → Hero folds.
- Uncalled bet (2500) → игрок1; игрок1 collected 600 from pot.
- **Целевая классификация:** BIG_FOLD / TURN.
- chipResult = **-300**.

## 4. big-fold-river — BIG_FOLD на ривере

Файл: `gg/04-big-fold-river.txt`

- Те же места/стеки/блайнды/карты Hero (`Tc Td`).
- PREFLOP: raise 300 / call. FLOP `Kd 7s 2c`: check-check. TURN `9h`: check-check.
- RIVER `4d`: игрок1 bets 2500 → Hero folds.
- Uncalled bet (2500) → игрок1; игрок1 collected 600 from pot.
- **Целевая классификация:** BIG_FOLD / RIVER.
- chipResult = **-300**.

## 5. fold-invest-preflop — FOLD_INVEST на префлопе

Файл: `gg/05-fold-invest-preflop.txt`

- 2-max, Seat1=Hero(SB), Seat2=игрок1(BB). Стеки 5000/5000. SB50/BB100.
- Карты Hero: `Jc Jd`.
- PREFLOP: Hero raises 550 to 600 (открытие крупнее порога 500) → игрок1 raises 3900 to
  4500 → Hero folds.
- Uncalled bet (3900) → игрок1; игрок1 collected 700 from pot.
- **Целевая классификация:** `decisionMarks` содержит канал `FOLD_INVEST` со `street:
  "PREFLOP"` (Hero сам поставил ≥500 на префлопе и сбросил на встречный рейз в тот же ход).
  Заодно триггерится и BIG_FOLD (это нормально, оба канала легитимны для одной раздачи —
  see decision-weight.ts, они не взаимоисключающие).
- chipResult = **-600**.

## 6. fold-invest-flop — FOLD_INVEST на флопе (c-bet → фолд на рейз)

Файл: `gg/06-fold-invest-flop.txt`

- 2-max, Seat1=Hero(SB), Seat2=игрок1(BB). Стеки 5000/5000. SB50/BB100.
- Карты Hero: `Ah Kc`.
- PREFLOP: Hero raises 250 to 300 → игрок1 calls 200 (пот 600).
- FLOP `Qs 7d 3c`: игрок1 checks → Hero bets 600 (c-bet) → игрок1 raises 1800 to 2400 →
  Hero folds.
- Uncalled bet (1800) → игрок1; игрок1 collected 900 from pot.
- **Целевая классификация:** FOLD_INVEST / FLOP (свой бет 600≥500 на этой улице → фолд на
  рейз).
- chipResult = **-900**.

## 7. fold-invest-turn — FOLD_INVEST на тёрне

Файл: `gg/07-fold-invest-turn.txt`

- Те же места/карты Hero (`Ah Kc`).
- PREFLOP raise 300/call (пот 600). FLOP `Qs 7d 3c`: check-check.
- TURN `9h`: игрок1 checks → Hero bets 800 → игрок1 raises 2400 to 3200 → Hero folds.
- Uncalled bet (2400) → игрок1; игрок1 collected 1100 from pot.
- **Целевая классификация:** FOLD_INVEST / TURN.
- chipResult = **-1100**.

## 8. fold-invest-river — FOLD_INVEST на ривере

Файл: `gg/08-fold-invest-river.txt`

- Те же места/карты Hero (`Ah Kc`).
- PREFLOP raise 300/call. FLOP `Qs 7d 3c` check-check. TURN `9h` check-check.
- RIVER `4c`: игрок1 checks → Hero bets 900 → игрок1 raises 2700 to 3600 → Hero folds.
- Uncalled bet (2700) → игрок1; игрок1 collected 1200 from pot.
- **Целевая классификация:** FOLD_INVEST / RIVER.
- chipResult = **-1200**.

## 9. won-bluff-flop — WON_BLUFF на флопе

Файл: `gg/09-won-bluff-flop.txt`

- 2-max, Seat1=Hero(SB), Seat2=игрок1(BB). Стеки 5000/5000. SB50/BB100.
- Карты Hero: `5h 4h` (воздух на этом борде, без реального дро).
- PREFLOP: Hero raises 250 to 300 → игрок1 calls 200 (пот 600).
- FLOP `Kd 9s 2c`: игрок1 checks → Hero bets 700 (блеф) → игрок1 folds.
- Uncalled bet (700) → Hero; Hero collected 600 from pot.
- **Целевая классификация:** `decisionMarks` содержит `WON_BLUFF` со `street: "FLOP"`.
  Подтверждено: chipResult>0, никто не вскрылся (shown.length=0), последняя крупная
  агрессия Hero — форма BLUFF (AIR, без дро ≥8 аутов) по `heroActionShapes`.
- chipResult = **+300**.

## 10. won-bluff-turn — WON_BLUFF на тёрне

Файл: `gg/10-won-bluff-turn.txt`

- Те же места/карты Hero (`5h 4h`).
- PREFLOP raise 300/call (пот 600). FLOP `Kd 9s 2c`: check-check.
- TURN `7h`: игрок1 checks → Hero bets 900 (блеф) → игрок1 folds.
- Uncalled bet (900) → Hero; Hero collected 600 from pot.
- **Целевая классификация:** WON_BLUFF / TURN.
- chipResult = **+300**.

## 11. won-bluff-river — WON_BLUFF на ривере

Файл: `gg/11-won-bluff-river.txt`

- Те же места/карты Hero (`5h 4h`).
- PREFLOP raise 300/call. FLOP `Kd 9s 2c` check-check. TURN `7h` check-check.
- RIVER `3d`: игрок1 checks → Hero bets 1000 (блеф) → игрок1 folds.
- Uncalled bet (1000) → Hero; Hero collected 600 from pot.
- **Целевая классификация:** WON_BLUFF / RIVER.
- chipResult = **+300**.

## 12. big-call-won-flop — BIG_CALL_WON на флопе

Файл: `gg/12-big-call-won-flop.txt`

- 2-max. Seat1=Hero(BB), Seat2=игрок1(BTN/SB, кнопка на Seat#2!). Стеки 5000/5000.
  игрок1 posts SB 50, Hero posts BB 100.
- Карты Hero: `Ah Qh`.
- PREFLOP: игрок1 raises 250 to 300 → Hero calls 200 (пот 600).
- FLOP `2h 9h 7c`: игрок1 bets 600 → **Hero calls 600** (это целевое решение — колл ≥500
  на постфлопе).
- TURN `Ac`: check-check. RIVER `4d`: check-check.
- Шоудаун: игрок1 shows `Kc Kd` (пара королей). Hero collected 1800 from pot (его
  Ah Qh + борд 2h9h7cAc4d = пара тузов, старше пары королей — Hero выигрывает).
- **Целевая классификация:** `decisionMarks` содержит `BIG_CALL_WON` со `street: "FLOP"`.
  Подтверждено реальным перебором `equityVsHand(["Ah","Qh"], ["Kc","Kd"], ["2h","9h","7c"])`
  = **45.4%** — попадает в пограничную зону [33%, 67%) на МОМЕНТ колла (флоп, эквити
  считается по борду на тот момент, не по итоговому 5-карточному борду).
- chipResult = **+900**.

## 13. big-call-won-turn — BIG_CALL_WON на тёрне

Файл: `gg/13-big-call-won-turn.txt`

- 2-max. Seat1=Hero(BB), Seat2=игрок1(BTN/SB). Стеки 5000/5000.
- Карты Hero: `Ah Kh`.
- PREFLOP: игрок1 raises 250 to 300 → Hero calls 200 (пот 600).
- FLOP `Jh Th 2c`: check-check.
- TURN `3d`: игрок1 bets 900 → **Hero calls 900** (целевое решение).
- RIVER `8s`: check-check.
- Шоудаун: игрок1 shows `Qc Qd`. Hero collected 2400 from pot.
- **Целевая классификация:** `BIG_CALL_WON` / `street: "TURN"`. Подтверждено:
  `equityVsHand(["Ah","Kh"], ["Qc","Qd"], ["Jh","Th","2c","3d"])` = **36.4%** (в зоне
  [33,67), на момент колла на тёрне — 1 карта до ривера).
- chipResult = **+1200**.

## 14. big-call-won-river — BIG_CALL_WON на ривере (3-way, ничья с мёртвыми деньгами)

Файл: `gg/14-big-call-won-river.txt`

На ривере эквити детерминировано (0/50/100%), поэтому «пограничная зона» возможна
ТОЛЬКО при точной ничьей (50%). Чтобы при этом Hero остался в чистом плюсе, нужен
третий игрок, который сбросил раньше и оставил в банке мёртвые деньги.

- Стол: **3-max**. Seat1=игрок2(button), Seat2=игрок1(SB), Seat3=Hero(BB). Стеки 5000
  у всех троих.
- Блайнды: игрок1 posts SB 50, Hero posts BB 100.
- Карты Hero: `2c 3d` (не участвуют в финальной руке — «играет борд»).
- PREFLOP: игрок2 raises 200 to 300 → игрок1 calls 250 → Hero calls 200. Пот 900.
- FLOP `8h 9d Tc`: игрок1 checks → Hero bets 400 → игрок1 calls 400 → **игрок2 folds**
  (мёртвые деньги — его 300 преф-инвестиции остаются в банке).
- TURN `Js`: игрок1 bets 800 → Hero calls 800.
- RIVER `Qh`: игрок1 bets 2000 → **Hero calls 2000** (целевое решение).
- Итоговый борд `8h 9d Tc Js Qh` — готовый стрит 8-9-T-J-Q ЦЕЛИКОМ на борде. И Hero
  (`2c 3d`), и игрок1 (шоу `4h 5s`) не улучшают борд своими картами → у обоих
  ОДИНАКОВАЯ рука (стрит до дамы) → **ничья**, банк делится пополам.
- Шоудаун: игрок1 shows `4h 5s`; игрок1 collected 3650 from pot; Hero collected 3650 from
  pot (пот 7300 делится 3650/3650).
- **Целевая классификация:** `BIG_CALL_WON` / `street: "RIVER"`. Подтверждено:
  `equityVsHand(["2c","3d"], ["4h","5s"], ["8h","9d","Tc","Js","Qh"])` = **50%** (ровно
  в середине зоны [33,67)). chipResult>0 достигается не за счёт выигрыша у игрок1
  (ничья), а за счёт мёртвых денег игрок2, попавших в общий банк.
- chipResult = **+150** (Hero вложил 300+400+800+2000=3500, получил назад 3650 → чистый
  плюс 150, ровно половина от форфейта игрок2 в 300 фишек).

**Важно для порта в iPoker:** реализуй ИМЕННО эту механику (3 игрока, третий сбрасывает
на флопе после матчинга префлопа, Hero и первый игрок доходят до ривера и делят банк
пополам через одинаковую 5-карточную руку из борда). Если движок iPoker считает
эквити/деление иначе — главное, чтобы Hero НЕТТО заработал положительно при точной ничьей
с оппонентом, чьи карты вскрыты.

## 15. missed-value-turn — MISSED_VALUE на тёрне

Файл: `gg/15-missed-value-turn.txt`

- 2-max. Seat1=Hero(SB), Seat2=игрок1(BB). Стеки 5000/5000. SB50/BB100.
- Карты Hero: `Ah Kd` (топ две пары — тузы и короли — после флопа).
- PREFLOP: Hero raises 250 to 300 → игрок1 calls 200 (пот 600).
- FLOP `Ad Kc 2h`: игрок1 checks → Hero bets 700 (велью) → игрок1 calls 700 (пот 2000).
- TURN `7s`: **игрок1 checks → Hero checks** (недобор — целевое решение: сильная рука
  прочекана насквозь на этой улице).
- RIVER `3d`: игрок1 bets 900 → Hero calls 900 (пот 3800).
- Шоудаун: игрок1 shows `Qc Qd` (одна пара, слабее). Hero collected 3800 from pot.
- **Целевая классификация:** `decisionMarks` содержит `MISSED_VALUE` со `street: "TURN"`.
  Подтверждено: улица прочекана насквозь (ни одной ставки на TURN), рука Hero на тот
  момент — две пары (STRONG_MADE), банк в точке чека = 2000 фишек = 20bb (≥ порога 5bb),
  Hero был впереди вскрытой руки игрок1 на 4-карточном борде.
- chipResult = **+1900**.

## 16. missed-value-river — MISSED_VALUE на ривере

Файл: `gg/16-missed-value-river.txt`

- Те же места/карты Hero (`Ah Kd`).
- PREFLOP raise 300/call. FLOP `Ad Kc 2h`: check → Hero bets 700 → call (пот 2000).
- TURN `7s`: игрок1 checks → **Hero bets 800** (не чек в этот раз — чтобы не задвоить
  MISSED_VALUE с тёрном) → игрок1 calls 800 (пот 3600).
- RIVER `3d`: **игрок1 checks → Hero checks** (целевое решение — недобор на ривере).
- Шоудаун: игрок1 shows `Qc Qd`. Hero collected 3600 from pot.
- **Целевая классификация:** MISSED_VALUE / RIVER (тёрн НЕ прочекан — там был бет, поэтому
  единственная прочеканная насквозь улица — ривер).
- chipResult = **+1800**.

## 17. lucky-win-flop — LUCKY_WIN/кулер на флопе

Файл: `gg/17-lucky-win-flop.txt`

- 2-max. Seat1=Hero(SB), Seat2=игрок1(BB). Стеки 5000/5000. SB50/BB100.
- Карты Hero: `Kh Jd`.
- PREFLOP: Hero raises 250 to 300 → игрок1 calls 200 (пот 600).
- FLOP `Ad Kc 2h`: игрок1 bets 600 → **Hero calls 600** (это и есть крупное вложение
  «далеко позади» — целевое решение).
- TURN `7s`: check-check. RIVER `Jh`: check-check (Hero добирает две пары королей и
  валетов на ривере).
- Шоудаун: игрок1 shows `As Qc` (топ-пара тузов + оверкарта — на флопе далеко впереди
  Hero). Hero collected 1800 from pot.
- **Целевая классификация:** `detectHeroLuckyWin(snapshot)` → `{street: "FLOP", equityPct:
  18.4}`. Подтверждено: `equityVsHand(["Kh","Jd"], ["As","Qc"], ["Ad","Kc","2h"])` = 18.4%
  (<33%) на момент флоп-колла — Hero выиграл раздачу, но был далеко позади в момент
  крупного вложения.
- chipResult = **+900**.

## 18. lucky-win-turn — LUCKY_WIN/кулер на тёрне

Файл: `gg/18-lucky-win-turn.txt`

- 2-max. Seat1=Hero(SB), Seat2=игрок1(BB). Стеки 5000/5000. SB50/BB100.
- Карты Hero: `6c 6d` (карманная пара).
- PREFLOP: Hero raises 250 to 300 → игрок1 calls 200 (пот 600).
- FLOP `Kh 9h 2c`: check-check (маленькое/нулевое вложение — НЕ решение доезда).
- TURN `3d`: игрок1 bets 900 → **Hero calls 900** (целевое крупное вложение на тёрне).
- RIVER `6h`: check-check (Hero добирает трипс шестёрок).
- Шоудаун: игрок1 shows `Ac Kd` (топ-пара тузов/королей — далеко впереди на тёрне).
  Hero collected 2400 from pot.
- **Целевая классификация:** `detectHeroLuckyWin` → `{street: "TURN", equityPct: 4.5}`.
  Подтверждено: `equityVsHand(["6c","6d"], ["Ac","Kd"], ["Kh","9h","2c","3d"])` = 4.5%
  (<33%, всего 2 живых шестёрки на ривер).
- chipResult = **+1500**.

## 19. lucky-win-river — LUCKY_WIN/кулер на ривере (3-way, побочный банк)

Файл: `gg/19-lucky-win-river.txt`

Как и №14 — на ривере эквити детерминировано (0/50/100%), поэтому «выиграл, но был
далеко позади» на ривере возможен ТОЛЬКО если Hero проигрывает ГЛАВНЫЙ банк одному
сопернику (эквити 0%), но чисто зарабатывает на побочном банке против другого.

- Стол: **3-max**. Seat1=игрок2 (короткий стек, 1500), Seat2=игрок1 (SB, 10000),
  Seat3=Hero (BB, 10000).
- Блайнды: игрок1 posts SB 50, Hero posts BB 100.
- Карты Hero: `4c 7d`.
- PREFLOP: игрок2 raises 200 to 300 → игрок1 calls 250 → Hero calls 200. Пот 900.
- FLOP `9s 4d 2c`: **игрок2 raises 1200 to 1500 and is all-in** (весь его стек) →
  игрок1 calls 1200 → Hero calls 1200. Игрок2 больше не действует (all-in).
- TURN `Kh`: игрок1 bets 1000 → **Hero calls 1000**.
- RIVER `7s`: игрок1 bets 3000 → **Hero calls 3000** (целевое крупное решение — самое
  позднее и самое большое вложение Hero на постфлопе).
- Итоговый борд: `9s 4d 2c Kh 7s`.
- Шоудаун: игрок2 shows `9c 9h` → **сет девяток** (9s борда + 9c9h = трипс) — бьёт всех.
  игрок1 shows `Kc 5h` → пара королей (Kh борда). Hero `4c 7d` + борд → две пары
  (четвёрки и семёрки) — бьёт пару королей игрок1, но проигрывает сету игрок2.
- Деньги: игрок2 (сет) забирает ГЛАВНЫЙ банк (все три уровня по 1500 = 4500). Hero и
  игрок1 после кэпа игрок2 продолжали торговаться (турн+ривер) — это ПОБОЧНЫЙ банк
  (8000), в котором Hero сильнее игрок1 → забирает его целиком.
- Строки: игрок2 collected 4500 from pot; Hero collected 8000 from pot.
- **Целевая классификация:** `detectHeroLuckyWin` → `{street: "RIVER", equityPct: 0}`.
  Подтверждено: `equityVsHand(["4c","7d"], ["9c","9h"], ["9s","4d","2c","Kh","7s"])` = **0%**
  (Hero проигрывает сету девяток на полном борде — это и есть «эквити <33% против худшей
  из вскрытых рук», на ривере оно всегда 0/50/100). При этом
  `equityVsHand(["4c","7d"], ["Kc","5h"], тот же борд)` = 100% (Hero бьёт игрок1) —
  детектор берёт МИНИМУМ по всем вскрытым рукам = 0%.
- chipResult = **+2500** (Hero вложил 100+200+1200+1000+3000=5500, получил 8000 →
  чистый плюс 2500, несмотря на проигрыш главного банка сету).

**Важно для порта в iPoker:** нужен именно побочный банк (short-stack all-in раньше двух
других игроков, которые продолжают торговаться дальше). Если движок iPoker считает
банки иначе технически — главное сохранить итог: тот, кто вскрыл СЕТ, забирает часть
банка, а Hero чисто зарабатывает на разнице, хотя по факту проигрывает лучшей вскрытой
руке на столе.

## 20. default-no-channel-value-line — дефолт без явного канала

Файл: `gg/20-default-no-channel-value-line.txt`

- 2-max. Seat1=Hero(SB), Seat2=игрок1(BB). Стеки 5000/5000. SB50/BB100.
- Карты Hero: `Qc Jd` (топ-пара дам с валетом-кикером после флопа).
- PREFLOP: Hero raises 250 to 300 → игрок1 calls 200 (пот 600).
- FLOP `9d 5c 2h`: игрок1 checks → Hero bets 400 → игрок1 calls 400 (пот 1400).
- TURN `Kc`: игрок1 checks → Hero bets 600 → игрок1 calls 600 (пот 2800).
- RIVER `7s`: игрок1 checks → Hero bets 900 → игрок1 calls 900 (пот 4400).
- Шоудаун: игрок1 shows `Ks Th` (король-хай, без пары — проигрывает). Hero collected
  4400 from pot.
- **Целевая классификация:** `topDecisionMark(snapshot, chipResult)` === **null**.
  Штатная велью-линия: Hero НИ РАЗУ не фолдит, не чекает и не коллирует постфлоп (только
  ставит), поэтому ни один из пяти каналов (BIG_FOLD/FOLD_INVEST/WON_BLUFF/BIG_CALL_WON/
  MISSED_VALUE) не может сработать по построению — это «дефолт», не пограничный случай.
- chipResult = **+2200**.

## 21. expensive-loss-no-channel — «дорогая спорная потеря» без канала

Файл: `gg/21-expensive-loss-no-channel.txt`

- 2-max. Seat1=Hero(SB), Seat2=игрок1(BB). Стеки 5000/5000. SB50/BB100.
- Карты Hero: `Kc Kh` (карманные короли — на флопе фулл-хаус «короли на восьмёрках»).
- PREFLOP: Hero raises 250 to 300 → игрок1 calls 200 (пот 600).
- FLOP `Kd 8s 8c`: игрок1 checks → Hero bets 700 → игрок1 calls 700 (пот 2000). (Hero:
  трипс королей + пара восьмёрок борда = фулл-хаус, очень сильная рука.)
- TURN `2d`: игрок1 checks → Hero bets 1200 → игрок1 calls 1200 (пот 4400).
- RIVER `5c`: игрок1 checks → **Hero bets 3000** → игрок1 calls 3000 (пот 10400).
- Шоудаун: игрок1 shows `8h 8d` — вместе с 8s/8c борда это **каре восьмёрок**, бьёт
  фулл-хаус Hero (классический кулер «фулл против каре», игрок1 слоуплеил всю раздачу).
  игрок1 collected 10400 from pot.
- **Целевая классификация:** `topDecisionMark(snapshot, chipResult)` === **null** (Hero
  снова только ставит — ни один канал не может сработать), при этом chipResult<0 —
  это и есть «дорогая спорная потеря» (в `renderCriticalReason` попадёт дефолтная фраза
  про кулер/спорную потерю).
- chipResult = **-5200**.

## 22. ends-before-flop — раздача закончилась ДО флопа

Файл: `gg/22-ends-before-flop.txt`

- 2-max. Seat1=Hero(SB), Seat2=игрок1(BB). Стеки 5000/5000. SB50/BB100.
- Карты Hero: `Kc 7d` (не пара — специально, чтобы НЕ триггерить BIG_FOLD/FOLD_INVEST).
- PREFLOP: Hero raises 200 to 250 (открытие МЕЛЬЧЕ порога 500 — всего 250 фишек
  вложено) → игрок1 raises 3400 to 3500 → Hero folds.
- **Флопа в файле нет вообще** — ни `*** FLOP ***`, ни `Board [...]` в SUMMARY.
- Uncalled bet (3250) → игрок1; игрок1 collected 500 from pot.
- **Целевая классификация:** структурная — `tableSnapshot.board.length === 0`. Плюс
  бонус: `topDecisionMark` тоже **null** (Hero держит некарманную руку И вложил всего
  250 < порога 500 → ни BIG_FOLD, ни FOLD_INVEST не триггерятся — это чистая
  «раздача без единого яркого признака», в отличие от №1, где то же самое префлоп-BIG_FOLD
  специально СРАБАТЫВАЕТ).
- chipResult = **-250**.

## 23. multiway-big-fold-several-allins — мультивей 3+, несколько олл-инов подряд, BIG_FOLD

Файл: `gg/23-multiway-big-fold-several-allins.txt`

- Стол: **4-max**. Seat1=игрок1(button, 5000), Seat2=игрок2(SB, **50** — короткий, весь
  стек = блайнд), Seat3=игрок3(BB, **100** — короткий), Seat4=Hero(5000).
- Блайнды: игрок2 posts SB 50, игрок3 posts BB 100.
- Карты Hero: `Th Tc` (карманная пара — «hadSomething» через сделанную руку на флопе).
- PREFLOP: Hero calls 100 → игрок1 calls 100 → игрок2 calls 50 (докол до 100) → игрок3
  checks. Все четверо видят флоп (**3 живых соперника** на решении Hero). Пот 400.
- FLOP `Qc 8d 3h`: игрок2 checks → **игрок3 bets 1500 and is all-in** → **игрок1 raises
  3400 to 4900 and is all-in** (два олл-ина ПОДРЯД) → игрок2 folds → **Hero folds**
  (toCall от игрок1 = 4900, намного больше порога 500).
- Uncalled bet (3400) → игрок1 (игрок3 не мог покрыть остаток, и никто кроме игрок1 не
  доложил); игрок1 shows `Qh Qd` (сет дам), игрок3 shows `Ac Kc` (проигрывает); игрок1
  collected 3400 from pot.
- **Целевая классификация:** `topDecisionMark` → `{channel: "BIG_FOLD", street: "FLOP"}`.
  Плюс структурные проверки: на решении Hero живы 3 соперника (игрок1, игрок2, игрок3),
  и подряд идут ДВА действия `ALL_IN`.
- chipResult = **-100**.

## 24. multiway-won-bluff — мультивей 3+, WON_BLUFF

Файл: `gg/24-multiway-won-bluff.txt`

- Стол: **4-max**. Seat1=игрок1(button, 5000), Seat2=игрок2(SB, 5000), Seat3=игрок3(BB,
  5000), Seat4=Hero(5000).
- Блайнды: игрок2 posts SB 50, игрок3 posts BB 100.
- Карты Hero: `7c 6c` (воздух на итоговом борде, без реального дро).
- PREFLOP: Hero calls 100 → игрок1 calls 100 → игрок2 calls 50 → игрок3 checks. Все
  четверо видят флоп. Пот 400.
- FLOP `Kd 9c 4h`: check-check-check-check (все четверо чекают).
- TURN `2s`: игрок2 checks → игрок3 checks → **Hero bets 900** (блеф) → игрок1 folds →
  игрок2 folds → игрок3 folds (все ТРИ оппонента сбрасывают).
- Uncalled bet (900) → Hero; Hero collected 400 from pot.
- **Целевая классификация:** `decisionMarks` содержит `WON_BLUFF`. Структурно: на
  решении Hero живы 3 соперника (игрок1/игрок2/игрок3), все трое фолдят на один и тот же
  бет.
- chipResult = **+300**.

## 25. heads-up-structural — хедз-ап (только SB/BB)

Файл: `gg/25-heads-up-structural.txt`

- 2-max, ровно 2 места. Seat1=Hero(SB), Seat2=игрок1(BB). Стеки 5000/5000. SB50/BB100.
- Карты Hero: `Ks Qd`.
- PREFLOP: Hero raises 250 to 300 → игрок1 calls 200 (пот 600).
- FLOP `9d 5c 2h`: check → Hero bets 400 → call (пот 1400).
- TURN `Kc`: check → Hero bets 600 → call (пот 2800). (Hero топ-пара королей.)
- RIVER `7s`: check → Hero bets 900 → call (пот 4400).
- Шоудаун: игрок1 shows `Jc Th` (без пары, проигрывает). Hero collected 4400 from pot.
- **Целевая классификация:** чисто структурная — `tableSnapshot.tableSize === 2`,
  ровно 2 места, позиции ограничены SB/BB (у баттона в HU позиция помечается кодом как
  BTN, у второго места — BB; никакого мультивея, никаких «Player N»). Никакого
  специального канала не требуется (штатная велью-линия, аналог №20, но с фокусом на
  структуру стола).
- chipResult = **+2200**.

## 26. six-max-hj-co-btn — 6-max, позиции HJ/CO/BTN

Файл: `gg/26-six-max-hj-co-btn.txt`

- Стол: **6-max**. Кнопка — Seat 6.
  - Seat1=игрок1 (SB), Seat2=игрок2 (BB), Seat3=игрок3 (LJ), Seat4=игрок4 (HJ),
    Seat5=**Hero (CO)**, Seat6=игрок5 (BTN). Все стеки 5000.
- Блайнды: игрок1 posts SB 50, игрок2 posts BB 100.
- Карты Hero: `Ah Ks`.
- PREFLOP: игрок3(LJ) folds → игрок4(HJ) raises 200 to 300 → **Hero(CO) raises 600 to
  900** → игрок5(BTN) folds → игрок1(SB) folds → игрок2(BB) folds → игрок4(HJ) calls 600.
- FLOP `Ac Kd 4h` (Hero топ две пары): игрок4 checks → Hero bets 1000 → игрок4 folds.
- Uncalled bet (1000) → Hero; Hero collected 1950 from pot.
- **Целевая классификация:** структурная — `tableSnapshot.tableSize === 6`; после
  парсинга место Hero (seatNumber=5) должно получить `positionName === "CO"`, место 4 —
  `"HJ"`, место 6 (кнопка) — `"BTN"`. Никакой decision-weight канал не обязателен (это
  штатный c-bet-фолд-аут), важна именно позиционная разметка 6-max.
- chipResult = **+1050**.

## 27. nine-max-early-positions — 9-max, ранние позиции по отдельности

Файл: `gg/27-nine-max-early-positions.txt`

- Стол: **9-max**. Кнопка — Seat 9.
  - Seat1=игрок1 (SB), Seat2=игрок2 (BB), Seat3=**Hero (UTG)**, Seat4=игрок3 (UTG+1),
    Seat5=игрок4 (UTG+2), Seat6=игрок5 (LJ), Seat7=игрок6 (HJ), Seat8=игрок7 (CO),
    Seat9=игрок8 (BTN). Все стеки 5000.
- Блайнды: игрок1 posts SB 50, игрок2 posts BB 100.
- Карты Hero: `Qc Qd`.
- PREFLOP: **Hero(UTG) raises 200 to 300** → игрок3/игрок4/игрок5/игрок6/игрок7/игрок8
  folds (все шестеро) → игрок1(SB) folds → игрок2(BB) calls 200.
- FLOP `Qh 8s 3d` (Hero флопит сет дам): игрок2 checks → Hero bets 500 → игрок2 folds.
- Uncalled bet (500) → Hero; Hero collected 650 from pot.
- **Целевая классификация:** структурная — `tableSnapshot.tableSize === 9`; после
  парсинга место 3 (Hero) → `positionName === "UTG"`, место 4 → `"UTG+1"`, место 5 →
  `"UTG+2"`, место 6 → `"LJ"`, место 7 → `"HJ"` — проверены ПО ОТДЕЛЬНОСТИ, не общей
  меткой EARLY.
- chipResult = **+350**.

## 28. short-stack-push-fold-12bb — короткий стек ~12bb, пуш-фолд

Файл: `gg/28-short-stack-push-fold-12bb.txt`

- 2-max. Seat1=**Hero (1200 фишек = ровно 12×BB)**, Seat2=игрок1 (5000, глубокий).
  SB50/BB100.
- Карты Hero: `Ac Ad`.
- PREFLOP: **Hero raises 1150 to 1200 and is all-in** (шове всем стеком) → игрок1
  calls 1100.
- Флоп/тёрн/ривер дealt без дальнейших решений (оба закоммичены): `2h 7c 9d` / `3s` /
  `Jh`.
- Шоудаун: Hero shows `Ac Ad`, игрок1 shows `Kc Kd` (Hero удерживает лучшую руку до
  конца). Hero collected 2400 from pot.
- **Целевая классификация:** структурная — `heroSeat.startingStack / bigBlind === 12`
  (короткий стек, зона пуш-фолда по Нэшу). Никакого decision-weight канала не требуется.
- chipResult = **+1200**.

## 29. deep-stack-thin-sizing — глубокий стек 100bb+, тонкий сайзинг

Файл: `gg/29-deep-stack-thin-sizing.txt`

- 2-max. Seat1=Hero (**25000 = 250×BB**), Seat2=игрок1 (25000). SB50/BB100.
- Карты Hero: `9h 8d` (пара девяток после флопа).
- PREFLOP: Hero raises 250 to 300 → игрок1 calls 200 (пот 600).
- FLOP `9c 5d 2h`: игрок1 checks → Hero bets 400 → игрок1 calls 400 (пот 1400).
- TURN `Kc`: check-check (пара девяток не топ-пара против такого борда — не MISSED_VALUE,
  сила недостаточная).
- RIVER `7s`: игрок1 checks → **Hero bets 350** (ТОНКИЙ сайзинг — 350 против банка 1400
  на тот момент = ровно 25%, гораздо меньше стандартных 66-75%) → игрок1 calls 350.
- Шоудаун: игрок1 shows `Qc Jd` (без пары). Hero collected 2100 from pot.
- **Целевая классификация:** структурная — `heroSeat.startingStack / bigBlind === 250`
  (глубокий стек ≥100bb) и `actions` содержит ставку Hero на RIVER величиной 350 при
  банке 1400 в этой точке (25% банка — тонкий велью-бет).
- chipResult = **+1050**.

## 30. call-continued-real-street — колл, реально продолжившийся до следующей улицы

Файл: `gg/30-call-continued-real-street.txt`

Регрессия 20.07: тренер иногда выдумывал гипотетику про улицу, которая на самом деле
не была сыграна (после фолда на более ранней улице). Эта раздача — контрольный пример,
где улица ПОСЛЕ колла реально наступила и была разыграна по-настоящему.

- 2-max. Seat1=Hero(SB), Seat2=игрок1(BB). Стеки 5000/5000. SB50/BB100.
- Карты Hero: `Ah Qc`.
- PREFLOP: игрок1 raises 250 to 300 → Hero calls 250 (докол до 300, т.к. Hero уже
  поставил 50 как SB). Пот 600.
- FLOP `Th 6d 2c`: игрок1 bets 400 → **Hero calls 400** (флоп-колл — точка, после
  которой раздача реально продолжается).
- TURN `9s`: **действительно наступает и разыгрывается** — игрок1 checks → Hero checks
  (это НЕ гипотетика, а реальная строка в HH с настоящими действиями обоих игроков).
- RIVER `Kd`: игрок1 bets 900 → Hero folds.
- Uncalled bet (900) → игрок1; игрок1 collected 1400 from pot.
- **Целевая классификация:** структурная — `tableSnapshot.board.length === 5` (борд
  дошёл до ривера по-настоящему), и `actions` содержит ХОТЯ БЫ ОДНО действие Hero со
  `street: "TURN"` (реально сыгранная будущая улица после флоп-колла, не додуманная).
- chipResult = **-700**.

---

## Сводная таблица

| # | Файл | Целевая классификация | chipResult |
|---|---|---|---|
| 1 | 01-big-fold-preflop | BIG_FOLD / PREFLOP | -300 |
| 2 | 02-big-fold-flop | BIG_FOLD / FLOP | -300 |
| 3 | 03-big-fold-turn | BIG_FOLD / TURN | -300 |
| 4 | 04-big-fold-river | BIG_FOLD / RIVER | -300 |
| 5 | 05-fold-invest-preflop | FOLD_INVEST / PREFLOP | -600 |
| 6 | 06-fold-invest-flop | FOLD_INVEST / FLOP | -900 |
| 7 | 07-fold-invest-turn | FOLD_INVEST / TURN | -1100 |
| 8 | 08-fold-invest-river | FOLD_INVEST / RIVER | -1200 |
| 9 | 09-won-bluff-flop | WON_BLUFF / FLOP | +300 |
| 10 | 10-won-bluff-turn | WON_BLUFF / TURN | +300 |
| 11 | 11-won-bluff-river | WON_BLUFF / RIVER | +300 |
| 12 | 12-big-call-won-flop | BIG_CALL_WON / FLOP (eq 45.4%) | +900 |
| 13 | 13-big-call-won-turn | BIG_CALL_WON / TURN (eq 36.4%) | +1200 |
| 14 | 14-big-call-won-river | BIG_CALL_WON / RIVER (ничья 50%, 3-way) | +150 |
| 15 | 15-missed-value-turn | MISSED_VALUE / TURN | +1900 |
| 16 | 16-missed-value-river | MISSED_VALUE / RIVER | +1800 |
| 17 | 17-lucky-win-flop | LUCKY_WIN / FLOP (eq 18.4%) | +900 |
| 18 | 18-lucky-win-turn | LUCKY_WIN / TURN (eq 4.5%) | +1500 |
| 19 | 19-lucky-win-river | LUCKY_WIN / RIVER (eq 0%, 3-way побочный банк) | +2500 |
| 20 | 20-default-no-channel-value-line | нет канала (дефолт) | +2200 |
| 21 | 21-expensive-loss-no-channel | нет канала, спорная потеря | -5200 |
| 22 | 22-ends-before-flop | нет канала, board.length=0 | -250 |
| 23 | 23-multiway-big-fold-several-allins | BIG_FOLD, 3 живых соперника, 2 олл-ина подряд | -100 |
| 24 | 24-multiway-won-bluff | WON_BLUFF, 3 живых соперника | +300 |
| 25 | 25-heads-up-structural | структура: tableSize=2 | +2200 |
| 26 | 26-six-max-hj-co-btn | структура: tableSize=6, CO/HJ/BTN | +1050 |
| 27 | 27-nine-max-early-positions | структура: tableSize=9, UTG/UTG+1/UTG+2/LJ/HJ | +350 |
| 28 | 28-short-stack-push-fold-12bb | структура: стек=12bb | +1200 |
| 29 | 29-deep-stack-thin-sizing | структура: стек=250bb, ривер-бет=25% банка | +1050 |
| 30 | 30-call-continued-real-street | структура: реальный TURN после флоп-колла | -700 |

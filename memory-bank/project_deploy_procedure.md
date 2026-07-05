---
name: project_deploy_procedure
description: "КАК деплоить прод — git push в GitHub НЕ деплоит; сервер из РФ до GitHub не достаёт, крон-автопул ОТКЛЮЧЁН 2026-07-02 (вызывал флап 502); доставка ТОЛЬКО бандлом через КЗ-релей"
metadata: 
  node_type: memory
  type: project
  originSessionId: 45f8e8ef-2222-4f1e-bed6-ae8f50730a0c
---

**Деплой ≠ git push.** Прод-ВМ (Yandex Cloud 81.26.186.177) НЕ может достучаться до GitHub (РФ-блок), поэтому cron `~/deploy.sh` с `git fetch`/`git pull` из GitHub НЕ подтягивает коммиты — автодеплой мёртв. Пуш в origin/master сам по себе НИЧЕГО не выкатывает.

**Правильная доставка — бандлом через казахстанский релей** (VPS 92.60.75.87), он же jump-host к ВМ. Схема: собрать `git bundle` локально → доставить на ВМ через релей-jump → на ВМ применить бандл (fetch/pull из бандла) → `npm install` + `npm run build` + `pm2 restart trener`. Миграции БД (если есть) — `prisma migrate deploy` на ВМ. Инцидент 2026-06-26: `git fetch` к недоступному GitHub без таймаута вешал деплои (фикс timeout 120).

Прод-операции Клод делает САМ из своего терминала через релей-jump (feedback_server_ops_self). Точные команды бандл-доставки — в retrospectives (llm-релей-казахстан, deploy-pipeline-hang) и .business (gitignored, локально). SSH к ВМ: `ssh trener-vm@81.26.186.177`, ключ `~/.ssh/id_ed25519`; приложение под pm2 (`pm2 restart trener`, `pm2 logs trener`). [[project_deploy_status]] [[project_llm_connectivity_block]] [[project_i18n_english]]

**⚠️ КРИТИЧНО (усвоено 2026-07-02): `npm run build` на ВМ падает, если pm2-процесс `trener` РАБОТАЕТ.** У ВМ всего 1.9 ГБ RAM; одновременный `next start` + `next build` = гонка за каталогом `.next` и нехватка памяти → сборка валится НЕДЕТЕРМИНИРОВАННО (то `Type error: .next/types/.../page.ts not found`, то `ENOENT app-paths-manifest.json` / `Failed to collect page data for /icon.png`) — это НЕ баг кода. Правильно: `pm2 stop trener` → `rm -rf .next` → `npm run build` → `pm2 restart trener` (даунтайм ~1-2 мин на сборку). NB: 2026-07-02 swap поднят 2→6 ГБ (/swapfile 2G + /swapfile2 4G, оба в fstab) — на СЛЕДУЮЩЕМ деплое сначала попробовать сборку БЕЗ остановки процесса (swap может спасти от OOM); если снова падает — откат к «stop → build → start». ВСЕГДА бэкапить рабочий `.next` ВНЕ дерева (`mv .next.bak /tmp/...`, не внутрь trener/ — иначе попадает под tsc-скан) перед `rm -rf .next`; при провале сборки — восстановить и запустить.

**SSH-джамп, рабочая форма (форма `-J` давала Host key verification failed):** `ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=accept-new -o "ProxyCommand=ssh -i ~/.ssh/id_ed25519 -o StrictHostKeyChecking=accept-new -W %h:%p root@92.60.75.87" -l trener-vm 81.26.186.177`. Инкрементальный бандл: `git bundle create hf.bundle <prod-commit>..master` → scp через тот же ProxyCommand → на ВМ `git fetch <bundle> master && git merge --ff-only FETCH_HEAD`.

**🔴 Инцидент 2026-07-02 «флап 502» — крон-автодеплой ОТКЛЮЧЁН:** UptimeRobot прислал 502 (05:30). Причина: крон `*/5 ~/deploy.sh` НЕ полностью мёртв — когда GitHub из РФ на секунду становится доступен, `git fetch` проходит. А локальный HEAD на ВМ (6c179e7, приехал бандлом) ВПЕРЕДИ origin/master (7abcad4, туда 6c179e7 не пушился) → проверка `LOCAL != REMOTE` всегда истинна → крон делает НЕНУЖНЫЙ `npm run build` + `pm2 restart` поверх живого билда → `next start` читает наполовину переписанный `.next/*manifest.json` → `Unexpected end of JSON input` → крэш → pm2 поднимает → 502 на несколько секунд. За всё время 312 перезапусков; всплески 502 всякий раз, когда fetch случайно удавался. **Фикс:** (1) строка `*/5 … deploy.sh` в crontab ВМ закомментирована `#DISABLED-2026-07-02(флап502)` (остальные кроны целы; бэкап `~/crontab.bak.*`); (2) `deploy.sh` строка 21 усилена: `if [ "$LOCAL" != "$REMOTE" ] && git merge-base --is-ancestor "$LOCAL" "$REMOTE"; then` — собирать только если origin реально впереди локального (бэкап `~/deploy.sh.flapbak-20260702`). После фикса 10/10 запросов к /api/health = 200, счётчик рестартов замер. NB: диск/память были в норме — дело было ТОЛЬКО в кроне. Секрет-токен `/api/cron/*` торчит в crontab (localhost-only, при случае ротировать).

**Деплой 2026-07-02 (6c179e7) выполнен так, LIVE:** фикс подписи «Критическая» (баг: importanceLabel без ветки CRITICAL → сырой enum) + приоритет критическим раздачам в очереди. Прод-БД локальная. [[project_queue_latency]]

**Деплой 2026-07-03 (715855b) LIVE — большой батч** (i18n письма+тренер, админка,
промпт оппонентов, лик-трекер, /enter-первичный, фикс магик-редиректов): бандл
6c179e7..master через релей; на ВМ ПЕРЕД merge снят ручной хотфикс
(`git checkout -- trener/app/enter/verify/route.ts` + `git checkout -- trener/package-lock.json`
— ВМ-шный npm install портит lock) → merge --ff-only → npm install → migrate deploy
(add_player_locale + add_auth_events) → stop→build→restart. Дерево ВМ снова ЧИСТОЕ.

**Деплой 2026-07-03 вечер (094464c) LIVE** (зеркала всех спотов, верхний слот, автозапуск разбора, диапазонный движок, промпты «один урок»): бандл 22b19aa..master через релей; без npm install и миграций (зависимости/схема не менялись). ✅ ПОДТВЕРЖДЕНО: `npm run build` на ВМ прошёл БЕЗ остановки pm2 (своп 6 ГБ спас от OOM) — рецепт: бэкап `.next` в /tmp → build поверх живого → `pm2 restart` → /health 200, сайт снаружи 200. Даунтайма нет. Fallback stop→build→restart оставить на случай падения.

**Деплой 2026-07-04 (372591e) LIVE** (копирайт: шаг «Загрузи турнир» без GGPoker, короткие тире во всех текстах ru/en, обобщён failedBody): бандл 094464c..master через релей; без npm install и миграций. Build поверх живого pm2 снова прошёл (второе подтверждение рецепта без даунтайма), /health ok, оба языка проверены снаружи.

**Уроки этого деплоя:**
- ⚠️ registry.npmjs.org с ВМ ТАЙМАУТИТ (РФ-блок) — новые пакеты ставить с зеркала:
  `npm install --registry=https://registry.npmmirror.com` (целостность защищена
  integrity-хэшами из package-lock). При обрыве установки остаются битые
  `node_modules/.pkg-*` каталоги — `rm -rf` и повторить.
- ⚠️ После миграции с НОВОЙ МОДЕЛЬЮ обязательно `npx prisma generate` до build —
  иначе build падает на «db.<model> не существует» (postinstall-generate мог не
  отработать из-за упавшего npm install). Из-за этого билд 03-го упал с первого
  раза, сайт лежал ~4 мин вместо ~2.

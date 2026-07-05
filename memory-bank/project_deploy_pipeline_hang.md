---
name: project-deploy-pipeline-hang
description: "инцидент 2026-06-26 — git fetch в deploy.sh виснет на недоступном из РФ GitHub, без таймаута блокировал ВСЕ деплои на часы; пофикшено timeout-обёрткой"
metadata: 
  node_type: memory
  type: project
  originSessionId: 98e1a9e1-901b-4e11-802f-173a1612d52e
---

**Инцидент 2026-06-26.** Прод-деплой на VM (`~/deploy.sh`, крон каждые 5 мин, лог `~/deploy.log`,
flock `/tmp/deploy.lock`) встал на ~часы: `git fetch origin master` к GitHub завис НАМЕРТВО
(GitHub режет РФ-IP VM `81.26.186.177`, виснет ещё на этапе соединения — даже git
`http.lowSpeedTime` не спасает, данные не идут вообще). У git нет дефолтного таймаута → fetch
висит вечно, держит flock (дочерний fetch наследует fd 9 от deploy.sh, поэтому даже kill
родителя не освобождает лок — надо убивать сам `git fetch` по PID). Каждый следующий крон
писал «деплой уже идёт — пропуск». Итог: master накопил коммиты, на прод ничего не выезжало.

**Симптом, по которому ловить:** в `~/deploy.log` подряд «деплой уже идёт — пропуск»;
`ps aux | grep "git fetch"` показывает fetch с большим etime; `flock -n 9 9>/tmp/deploy.lock`
говорит ЗАНЯТА. Лечение здесь и сейчас: `kill -9 <PID git fetch>` (НЕ pkill -f — он рвёт
SSH-сессию), проверить лок освободился.

**Фикс (сделан):** строка fetch в `~/deploy.sh` обёрнута в `timeout 120` →
`if timeout 120 git fetch origin master; then ...`. Теперь зависший fetch умирает за 120с,
срабатывают штатные 5 ретраев, при неудаче `exit 0` — лок самоосвобождается, вечного зависа
больше нет. Бэкап старого скрипта на VM `~/deploy.sh.bak.<ts>`. Также на репо выставлен
`git config http.lowSpeedLimit 1000 / http.lowSpeedTime 30`.

**Доставка кода в обход мёртвого GitHub:** VM достаёт релей КЗ, не GitHub. Сделать git-бандл
локально (`git bundle create f.bundle <base>..master`), `scp` через релей-jump на VM, на VM
`git pull --ff-only f.bundle master`. Так health-фикс и попал на сервер 2026-06-26.

**ВАЖНО для будущих деплоев:** пока GitHub из РФ недоступен — крон-деплой не подтянет коммиты.
Либо ждать восстановления достижимости GitHub, либо доставлять бандлом через релей вручную.
Связано: [[feedback_server_ops_self]], [[project_deploy_status]], [[project_llm_connectivity_block]].

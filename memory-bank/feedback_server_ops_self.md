---
name: feedback-server-ops-self
description: прод-операции на сервере Клод делает САМ через свой терминал (не диктует команды Артёму); канонический рабочий метод подключения
metadata: 
  node_type: memory
  type: feedback
  originSessionId: c051023d-fa21-47e9-acc9-b092881a5a95
---

Прод-операции на VM (добивка деплоя, миграции, проверка pm2/health, разбор инцидентов) Клод делает **САМ из своего терминала** (Bash tool на машине Артёма) по методу ниже. НЕ диктовать команды Артёму на исполнение — он [[user_programming_level]] ноль в программировании и может напортачить. Просить его руками — только если метод реально не работает.

**Why:** мы специально настроили доступ, чтобы Клод оперировал сервером сам; ручной ввод человеком = источник ошибок на проде. **How to apply:** прежде чем «дать команды пользователю» для прода — сначала подключись и сделай сам.

**Канонический метод (подтверждён рабочим 2026-06-25 из Bash tool).** SSH через КЗ-релей `root@92.60.75.87` как jump к VM `trener-vm@81.26.186.177`. Нужен `dangerouslyDisableSandbox: true` (сетевой egress), ключ копируется в `/tmp/vmkey` (кириллица в $HOME ломает ProxyCommand), проверка host-key отключена (меняется после ребута VM):
```
cp ~/.ssh/id_ed25519 /tmp/vmkey && chmod 600 /tmp/vmkey
PJ='ssh -i /tmp/vmkey -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=15 -W %h:%p root@92.60.75.87'
ssh -i /tmp/vmkey -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=15 -o ProxyCommand="$PJ" trener-vm@81.26.186.177 '<команда на VM>'
```
Каталог приложения `~/trener-2-0` (Next под pm2 `trener`); деплой = `bash ~/deploy.sh` (cron сам тянет master, но миграции НЕ применяет — их добивать руками, см. [[project_deploy_status]]).

**Границы:** изменения прод-БД — с явного «ок» Артёма (правило проекта); значение из `.env`/`.env.production` в чат не печатать (грузить в env без вывода). Полная схема инфры, серт, NODE_EXTRA_CA_CERTS и заход на релей — в [[project_deploy_status]].
